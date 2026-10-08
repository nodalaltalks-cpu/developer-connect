import { UnauthorizedLeadActionError, LeadValidationError } from "./errors.ts";
import { AUTOMATION_RULES, CAPS, WINDOWS, chooseAssignee, resolveSettings, returnVisitKey, routingKey, staleLeadKey, visitReminderKey, visitWindow, type AutomationRule } from "./automation-rules.ts";
import { notifyDueFollowUps, sweepMissedFollowUps, type LeadNotification, type LeadNotifier } from "./follow-up-service.ts";
import type { LeadRepositories } from "./repository.ts";
import type { StaffRepository } from "../staff/repository.ts";
import type { AutomationAction, LeadActor } from "./types.ts";

/**
 * The automation engine. Framework-free. It is run by a secured scheduled request (see /api/automation/run) or by the
 * Founder pressing "Run now"; nothing here runs on its own.
 *
 * GUARANTEES (each is tested)
 *  - EXPLAINABLE: every rule is a plain, documented rule (automation-rules.ts); every action records which rule caused it.
 *  - AUDITABLE: each action is a row in automation_actions with its subject, attempts and outcome (ids only, no buyer data);
 *    automated reassignments also write the lead's own OWNER_CHANGED event with actor SYSTEM and the rule as the reason.
 *  - IDEMPOTENT: each action names the exact thing it is about (a dedupe key) and claims it atomically before acting, so
 *    running twice - or two runs at once - sends one reminder and makes one assignment.
 *  - RETRY-SAFE / FAILURE-SAFE: a failed action is marked FAILED and retried on later runs (a few attempts), a crashed run's
 *    abandoned claim is retried after a while, and one failure never stops the other actions. A reminder that fails to send
 *    is retried; an assignment is never undone by a failed notification about it.
 *  - TIMEZONE-SAFE: everything is an absolute instant; no calendar day is involved.
 *  - NOT AGGRESSIVE: caps per run, one reminder per thing, and reminders only reach the person who owns the work.
 */

export interface RunSummary {
  ranAt: Date;
  /** Per rule: what it did this run. */
  results: Record<AutomationRule, { enabled: boolean; sent: number; skipped: number; failed: number }>;
}

type Counter = { sent: number; skipped: number; failed: number };
const blank = (): Counter => ({ sent: 0, skipped: 0, failed: 0 });

async function perform(repos: LeadRepositories, input: { rule: AutomationRule; subjectType: string; subjectId: string; dedupeKey: string }, now: Date, counter: Counter, work: () => Promise<"DONE" | "SKIPPED">): Promise<void> {
  const claim = await repos.automationActions.claim({ ...input, now }, { maxAttempts: CAPS.MAX_ATTEMPTS, staleAfterMs: CAPS.CLAIM_STALE_MS });
  if (!claim) return; // already done, in flight elsewhere, or out of attempts
  try {
    const outcome = await work();
    await repos.automationActions.complete(claim.id, outcome, { rule: input.rule }, now);
    if (outcome === "DONE") counter.sent += 1;
    else counter.skipped += 1;
  } catch (error) {
    // Only a short code is stored: never the message (it could carry data) and never a stack.
    await repos.automationActions.fail(claim.id, error instanceof Error ? error.name.slice(0, 40) : "ERROR", now).catch(() => undefined);
    counter.failed += 1;
  }
}

export async function runAutomations(repos: LeadRepositories, staff: StaffRepository, notifier: LeadNotifier, now: Date = new Date()): Promise<RunSummary> {
  const settings = resolveSettings(await repos.automationSettings.getAll());
  const results = Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule, { enabled: settings[rule], ...blank() }])) as RunSummary["results"];

  // 1. Follow-up reminders: the existing, already-idempotent sweeps, now run proactively for everyone.
  if (settings.FOLLOW_UP_REMINDERS) {
    try {
      const missed = await sweepMissedFollowUps(repos, {}, now, notifier);
      const due = await notifyDueFollowUps(repos, {}, now, notifier);
      results.FOLLOW_UP_REMINDERS.sent = missed.length + due.length;
    } catch {
      results.FOLLOW_UP_REMINDERS.failed += 1;
    }
  }

  // 2. Site visit reminders: the narrowest window that applies, once per visit time.
  if (settings.SITE_VISIT_REMINDERS) {
    const visits = await repos.siteVisits.list({ statuses: ["SCHEDULED", "CONFIRMED"], from: now, to: new Date(now.getTime() + WINDOWS.VISIT_FAR_MS), limit: CAPS.PER_RUN });
    for (const visit of visits) {
      const window = visitWindow(visit.scheduledAt, now);
      if (!window) continue;
      await perform(repos, { rule: "SITE_VISIT_REMINDERS", subjectType: "SITE_VISIT", subjectId: visit.id, dedupeKey: visitReminderKey(visit.id, visit.scheduledAt, window) }, now, results.SITE_VISIT_REMINDERS, async () => {
        const lead = await repos.leads.getById(visit.leadId);
        // Reminded: whoever owns the lead NOW. A lead nobody owns (or an erased one) has no one to remind.
        if (!lead || lead.erasedAt !== null || !lead.ownerId) return "SKIPPED";
        const note: LeadNotification = { userId: lead.ownerId, type: "SITE_VISIT_DUE", title: "Site visit coming up", body: `A site visit on one of your leads is in about ${window === "2h" ? "2 hours" : "a day"}.`, targetRoute: `/team/leads/${lead.id}` };
        await notifier.notify(note);
        return "DONE";
      });
    }
  }

  // 3. Stale lead alerts: ONE digest notification per owner per run, covering the leads that newly went quiet (never one per
  //    lead - the first run after enabling could otherwise flood a team member). Each lead is still claimed individually
  //    (the key includes its last activity time, so new activity re-arms it), which is what keeps it once per quiet spell.
  if (settings.STALE_LEAD_ALERTS) {
    const stale = await repos.leads.listStale({ staleBefore: new Date(now.getTime() - WINDOWS.STALE_MS), limit: CAPS.PER_RUN });
    const byOwner = new Map<string, typeof stale>();
    for (const lead of stale) if (lead.ownerId) byOwner.set(lead.ownerId, [...(byOwner.get(lead.ownerId) ?? []), lead]);
    for (const [ownerId, leads] of byOwner) {
      const claimed: Array<{ id: string; leadId: string }> = [];
      for (const lead of leads) {
        const claim = await repos.automationActions.claim({ rule: "STALE_LEAD_ALERTS", subjectType: "LEAD", subjectId: lead.id, dedupeKey: staleLeadKey(lead.id, lead.lastActivityAt), now }, { maxAttempts: CAPS.MAX_ATTEMPTS, staleAfterMs: CAPS.CLAIM_STALE_MS });
        if (claim) claimed.push({ id: claim.id, leadId: lead.id });
      }
      if (claimed.length === 0) continue;
      try {
        await notifier.notify({
          userId: ownerId,
          type: "LEAD_STALE",
          title: claimed.length === 1 ? "A lead has gone quiet" : `${claimed.length} leads have gone quiet`,
          body: claimed.length === 1 ? "One of your open leads has had no activity for 7 days or more." : `${claimed.length} of your open leads have had no activity for 7 days or more.`,
          // One lead: open it. Several: open the workspace, where they are listed.
          targetRoute: claimed.length === 1 ? `/team/leads/${claimed[0].leadId}` : "/team",
        });
        for (const c of claimed) await repos.automationActions.complete(c.id, "DONE", { rule: "STALE_LEAD_ALERTS", digestSize: claimed.length }, now);
        results.STALE_LEAD_ALERTS.sent += claimed.length;
      } catch (error) {
        for (const c of claimed) await repos.automationActions.fail(c.id, error instanceof Error ? error.name.slice(0, 40) : "ERROR", now).catch(() => undefined);
        results.STALE_LEAD_ALERTS.failed += claimed.length;
      }
    }
  }

  // 3b. Return visit alerts: a buyer with an open lead came back to the site - tell the owner while the buyer is warm. One
  //     alert per lead per 12-hour bucket, to the lead's current owner only, with no buyer data in the message.
  if (settings.RETURN_VISIT_ALERTS) {
    const returns = await repos.leads.listReturnVisits({ since: new Date(now.getTime() - WINDOWS.RETURN_LOOKBACK_MS), minLeadAgeMs: WINDOWS.RETURN_MIN_AGE_MS, limit: CAPS.PER_RUN });
    for (const { lead, viewedAt } of returns) {
      await perform(repos, { rule: "RETURN_VISIT_ALERTS", subjectType: "LEAD", subjectId: lead.id, dedupeKey: returnVisitKey(lead.id, viewedAt) }, now, results.RETURN_VISIT_ALERTS, async () => {
        if (!lead.ownerId) return "SKIPPED";
        await notifier.notify({ userId: lead.ownerId, type: "LEAD_REVISITED", title: "A buyer is back on the site", body: "A buyer you are working with just came back to Developer Connects. A call now is well timed.", targetRoute: `/team/leads/${lead.id}` });
        return "DONE";
      });
    }
  }

  // 4. Automatic routing (OFF unless the Founder turned it on): least-loaded active employee gets the oldest unassigned lead.
  if (settings.AUTO_ROUTING) {
    const [members, workload, unassigned] = await Promise.all([staff.list(), repos.leads.countOpenByOwner(), repos.leads.listUnassignedOpen(CAPS.ROUTING_PER_RUN * 2)]);
    const eligible = unassigned.filter((l) => now.getTime() - l.createdAt.getTime() >= WINDOWS.ROUTING_MIN_AGE_MS).slice(0, CAPS.ROUTING_PER_RUN);
    const load = { ...workload };
    for (const lead of eligible) {
      const choice = chooseAssignee(members, load);
      if (!choice) break; // nobody active: leave every lead for the Founder
      await perform(repos, { rule: "AUTO_ROUTING", subjectType: "LEAD", subjectId: lead.id, dedupeKey: routingKey(lead.id) }, now, results.AUTO_ROUTING, async () => {
        const assigned = await repos.transaction(async (tx) => {
          const fresh = await tx.leads.getById(lead.id);
          // Re-check inside the transaction: someone may have assigned, returned or erased it since the list was read.
          if (!fresh || fresh.erasedAt !== null || fresh.ownerId !== null || fresh.returnedAt !== null) return false;
          await tx.events.append({ leadId: lead.id, eventType: "OWNER_CHANGED", actorType: "SYSTEM", actorId: null, developerId: null, fromStatus: null, toStatus: null, payload: { from: null, to: choice.member.userId, via: "AUTO_ROUTING", openLeadsAtChoice: choice.openLeads }, createdAt: now });
          await tx.leads.update(lead.id, { ownerId: choice.member.userId, lastActivityAt: now }, now);
          return true;
        });
        if (!assigned) return "SKIPPED";
        load[choice.member.userId] = (load[choice.member.userId] ?? 0) + 1;
        // The assignment is committed and recorded in the lead's history. Telling the new owner is best effort, exactly like a
        // manual assignment (see deliver()): a failed notification never undoes the assignment, and the lead shows in their list anyway.
        await notifier.notify({ userId: choice.member.userId, type: "LEAD_ASSIGNED", title: "New lead assigned", body: "A lead was assigned to you automatically. Open it to get started.", targetRoute: `/team/leads/${lead.id}` }).catch(() => undefined);
        return "DONE";
      });
    }
  }

  return { ranAt: now, results };
}

// --- Founder controls ------------------------------------------------------------------------------

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required for automation.");
}

export async function setAutomationEnabled(repos: LeadRepositories, rule: string, enabled: boolean, actor: LeadActor, now: Date = new Date()): Promise<void> {
  assertFounder(actor);
  if (!(AUTOMATION_RULES as readonly string[]).includes(rule)) throw new LeadValidationError("rule", "Choose an automation from the list.");
  if (typeof enabled !== "boolean") throw new LeadValidationError("enabled", "Choose on or off.");
  await repos.automationSettings.set(rule, enabled, actor.actorId, now);
}

export interface AutomationOverview {
  settings: Record<AutomationRule, boolean>;
  recent: AutomationAction[];
  /** Open leads each active team member holds now - the workload auto-routing balances. */
  workload: Array<{ userId: string; name: string; openLeads: number }>;
  unassignedOpen: number;
}

export async function getAutomationOverview(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor): Promise<AutomationOverview> {
  assertFounder(actor);
  const [stored, recent, members, load, unassigned] = await Promise.all([repos.automationSettings.getAll(), repos.automationActions.listRecent(50), staff.list(), repos.leads.countOpenByOwner(), repos.leads.listUnassignedOpen(500)]);
  return {
    settings: resolveSettings(stored),
    recent,
    workload: members.filter((m) => m.active).map((m) => ({ userId: m.userId, name: m.displayName, openLeads: load[m.userId] ?? 0 })).sort((a, b) => a.openLeads - b.openLeads || a.name.localeCompare(b.name)),
    unassignedOpen: unassigned.length,
  };
}

/** Run now (Founder only): the same engine, the same idempotency. */
export async function runAutomationsAsFounder(repos: LeadRepositories, staff: StaffRepository, notifier: LeadNotifier, actor: LeadActor, now: Date = new Date()): Promise<RunSummary> {
  assertFounder(actor);
  return runAutomations(repos, staff, notifier, now);
}
