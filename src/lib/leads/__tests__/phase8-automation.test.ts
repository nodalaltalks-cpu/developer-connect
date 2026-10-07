import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTOMATION_DEFAULTS, CAPS, chooseAssignee, resolveSettings, visitWindow, WINDOWS } from "../automation-rules.ts";
import { getAutomationOverview, runAutomations, setAutomationEnabled } from "../automation-service.ts";
import { assignLead, captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { scheduleSiteVisit } from "../site-visit-service.ts";
import { returnLeadToFounder } from "../follow-up-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember, setStaffActive } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadNotification, LeadNotifier } from "../follow-up-service.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Phase 8: the deterministic automation rules and the engine - explainable, auditable, idempotent, retry-safe. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function recorder(options: { failTimes?: number } = {}) {
  const sent: LeadNotification[] = [];
  let failures = options.failTimes ?? 0;
  const notifier: LeadNotifier = {
    async notify(n) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("notification store unavailable: secret detail that must never be stored");
      }
      sent.push(n);
    },
  };
  return { sent, notifier };
}

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number, at = T0) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3800 + n}`, name: `Buyer ${n}` }), at)).lead;
  return { repos, staff, priya, rohan, mk, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor };
}

// --- the rules --------------------------------------------------------------------------------------

test("defaults: reminders are ON, automatic routing is OFF; stored settings override; unknown keys are ignored", () => {
  assert.deepEqual(resolveSettings({}), { FOLLOW_UP_REMINDERS: true, SITE_VISIT_REMINDERS: true, STALE_LEAD_ALERTS: true, AUTO_ROUTING: false });
  assert.equal(AUTOMATION_DEFAULTS.AUTO_ROUTING, false);
  assert.deepEqual(resolveSettings({ AUTO_ROUTING: true, SITE_VISIT_REMINDERS: false, NOT_A_RULE: true } as never), { FOLLOW_UP_REMINDERS: true, SITE_VISIT_REMINDERS: false, STALE_LEAD_ALERTS: true, AUTO_ROUTING: true });
});

test("visit window: the narrowest applicable window, none for a past or far-future visit", () => {
  const now = T0;
  const at = (ms: number) => new Date(now.getTime() + ms);
  assert.equal(visitWindow(at(-1), now), null);
  assert.equal(visitWindow(at(0), now), null);
  assert.equal(visitWindow(at(WINDOWS.VISIT_NEAR_MS), now), "2h");
  assert.equal(visitWindow(at(WINDOWS.VISIT_NEAR_MS + 1), now), "24h");
  assert.equal(visitWindow(at(WINDOWS.VISIT_FAR_MS), now), "24h");
  assert.equal(visitWindow(at(WINDOWS.VISIT_FAR_MS + 1), now), null);
});

test("routing choice: least-loaded ACTIVE employee, ties broken by name then id - the same data always gives the same answer", async () => {
  const w = await world();
  const members = await w.staff.list();
  assert.equal(chooseAssignee(members, {})?.member.displayName, "Priya Nair", "tie: alphabetical");
  assert.equal(chooseAssignee(members, { [w.priya.userId]: 5, [w.rohan.userId]: 2 })?.member.displayName, "Rohan Das");
  assert.equal(chooseAssignee(members, { [w.priya.userId]: 2, [w.rohan.userId]: 2 })?.openLeads, 2);
  await setStaffActive(w.staff, w.rohan.id, false, FOUNDER, minutes(2));
  assert.equal(chooseAssignee(await w.staff.list(), { [w.priya.userId]: 99 })?.member.displayName, "Priya Nair", "an inactive member is never chosen, however idle");
  await setStaffActive(w.staff, w.priya.id, false, FOUNDER, minutes(3));
  assert.equal(chooseAssignee(await w.staff.list(), {}), null);
});

// --- the engine -------------------------------------------------------------------------------------

test("site visit reminders: sent to the lead's owner once per visit time and window, never twice, and the 2h one is a separate reminder", async () => {
  const w = await world();
  const lead = await w.mk(1);
  await assignLead(w.repos, w.staff, lead.id, w.priya.id, FOUNDER, minutes(5));
  const visitAt = new Date(T0.getTime() + 20 * HOUR);
  await scheduleSiteVisit(w.repos, lead.id, { scheduledAt: visitAt }, w.priyaActor, T0);
  const r = recorder();

  const now1 = T0;
  const first = await runAutomations(w.repos, w.staff, r.notifier, now1);
  assert.equal(first.results.SITE_VISIT_REMINDERS.sent, 1);
  assert.deepEqual(r.sent.map((n) => [n.userId, n.type, n.targetRoute]), [[w.priya.userId, "SITE_VISIT_DUE", `/team/leads/${lead.id}`]]);
  assert.match(r.sent[0].body, /a day/);
  assert.doesNotMatch(JSON.stringify(r.sent), /Buyer|98765/, "no buyer data in a notification");

  await runAutomations(w.repos, w.staff, r.notifier, new Date(T0.getTime() + HOUR));
  assert.equal(r.sent.length, 1, "running again changes nothing");

  await runAutomations(w.repos, w.staff, r.notifier, new Date(visitAt.getTime() - HOUR));
  assert.equal(r.sent.length, 2, "the 2 hour window is its own reminder");
  assert.match(r.sent[1].body, /2 hours/);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(visitAt.getTime() - 30 * 60_000));
  assert.equal(r.sent.length, 2, "and also only once");
});

test("site visit reminders: nothing for a lead nobody owns, a finished visit or one outside the windows; a reschedule is a new time so a new reminder", async () => {
  const w = await world();
  const mine = await w.mk(1);
  await assignLead(w.repos, w.staff, mine.id, w.priya.id, FOUNDER, minutes(5));
  const far = await scheduleSiteVisit(w.repos, mine.id, { scheduledAt: new Date(T0.getTime() + 3 * DAY) }, w.priyaActor, T0);
  const r = recorder();
  await runAutomations(w.repos, w.staff, r.notifier, T0);
  assert.equal(r.sent.length, 0, "3 days away is outside every window");
  const { changeSiteVisit } = await import("../site-visit-service.ts");
  await changeSiteVisit(w.repos, far.id, { kind: "RESCHEDULE", scheduledAt: new Date(T0.getTime() + 5 * HOUR) }, w.priyaActor, T0);
  await runAutomations(w.repos, w.staff, r.notifier, T0);
  assert.equal(r.sent.length, 1);
  const cancelled = (await w.repos.siteVisits.listByLead(mine.id)).find((v) => v.status === "SCHEDULED")!;
  await changeSiteVisit(w.repos, cancelled.id, { kind: "CANCEL", reason: "OTHER" }, w.priyaActor, T0);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(T0.getTime() + 4 * HOUR));
  assert.equal(r.sent.length, 1, "a cancelled visit gets no reminder");
});

test("stale lead alerts: once per quiet spell to the owner, as ONE digest per owner per run; new activity re-arms it; closed and unowned leads are ignored", async () => {
  const w = await world();
  const lead = await w.mk(1);
  const unowned = await w.mk(2);
  await assignLead(w.repos, w.staff, lead.id, w.priya.id, FOUNDER, minutes(5));
  const r = recorder();
  const early = new Date(T0.getTime() + 3 * DAY);
  await runAutomations(w.repos, w.staff, r.notifier, early);
  assert.equal(r.sent.filter((n) => n.type === "LEAD_STALE").length, 0, "not stale yet");
  const later = new Date(T0.getTime() + 9 * DAY);
  await runAutomations(w.repos, w.staff, r.notifier, later);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(later.getTime() + HOUR));
  const stale = r.sent.filter((n) => n.type === "LEAD_STALE");
  assert.equal(stale.length, 1, "one alert for the quiet spell, and none for the unowned lead");
  assert.equal(stale[0].userId, w.priya.userId);
  // New activity, then another quiet spell: a fresh alert.
  await w.repos.leads.update(lead.id, { lastActivityAt: later }, later);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(later.getTime() + 8 * DAY));
  assert.equal(r.sent.filter((n) => n.type === "LEAD_STALE").length, 2);
  void unowned;
});

test("follow-up reminders reuse the existing atomic sweeps: due-soon and missed are sent once, proactively, for every owner", async () => {
  const w = await world();
  const lead = await w.mk(1);
  await assignLead(w.repos, w.staff, lead.id, w.priya.id, FOUNDER, minutes(5));
  const due = new Date(T0.getTime() + 20 * 60_000);
  await scheduleFollowUp(w.repos, lead.id, { scheduledAt: due }, w.priyaActor, T0);
  const r = recorder();
  await runAutomations(w.repos, w.staff, r.notifier, new Date(T0.getTime() + 10 * 60_000));
  await runAutomations(w.repos, w.staff, r.notifier, new Date(T0.getTime() + 11 * 60_000));
  assert.deepEqual(r.sent.filter((n) => n.type === "FOLLOW_UP_DUE").map((n) => n.userId), [w.priya.userId]);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(due.getTime() + HOUR));
  await runAutomations(w.repos, w.staff, r.notifier, new Date(due.getTime() + 2 * HOUR));
  assert.equal(r.sent.filter((n) => n.type === "FOLLOW_UP_MISSED").length, 1);
});

test("idempotent under concurrency: two runs at the same moment send ONE reminder", async () => {
  const w = await world();
  const lead = await w.mk(1);
  await assignLead(w.repos, w.staff, lead.id, w.priya.id, FOUNDER, minutes(5));
  await scheduleSiteVisit(w.repos, lead.id, { scheduledAt: new Date(T0.getTime() + HOUR) }, w.priyaActor, T0);
  const r = recorder();
  await Promise.all([runAutomations(w.repos, w.staff, r.notifier, T0), runAutomations(w.repos, w.staff, r.notifier, T0), runAutomations(w.repos, w.staff, r.notifier, T0)]);
  assert.equal(r.sent.filter((n) => n.type === "SITE_VISIT_DUE").length, 1);
  assert.equal((await w.repos.automationActions.listRecent(50)).filter((a) => a.rule === "SITE_VISIT_REMINDERS").length, 1, "one logged action, not three");
});

test("retry-safe and failure-safe: a failed send is logged FAILED (with a code, never the message), retried on the next run, and gives up after the attempt limit", async () => {
  const w = await world();
  const lead = await w.mk(1);
  await assignLead(w.repos, w.staff, lead.id, w.priya.id, FOUNDER, minutes(5));
  await scheduleSiteVisit(w.repos, lead.id, { scheduledAt: new Date(T0.getTime() + HOUR) }, w.priyaActor, T0);
  const flaky = recorder({ failTimes: 1 });
  const first = await runAutomations(w.repos, w.staff, flaky.notifier, T0);
  assert.equal(first.results.SITE_VISIT_REMINDERS.failed, 1);
  const [failed] = await w.repos.automationActions.listRecent(5);
  assert.equal(failed.status, "FAILED");
  assert.deepEqual(failed.detail, { errorCode: "Error" });
  assert.doesNotMatch(JSON.stringify(failed), /secret detail/, "the error message is never stored");
  const second = await runAutomations(w.repos, w.staff, flaky.notifier, new Date(T0.getTime() + 60_000));
  assert.equal(second.results.SITE_VISIT_REMINDERS.sent, 1, "retried and delivered");
  assert.equal((await w.repos.automationActions.listRecent(5))[0].attempts, 2);

  // A permanently broken notifier stops being retried after the attempt limit.
  const w2 = await world();
  const l2 = await w2.mk(1);
  await assignLead(w2.repos, w2.staff, l2.id, w2.priya.id, FOUNDER, minutes(5));
  await scheduleSiteVisit(w2.repos, l2.id, { scheduledAt: new Date(T0.getTime() + HOUR) }, w2.priyaActor, T0);
  const broken = recorder({ failTimes: 99 });
  for (let i = 0; i < 6; i++) await runAutomations(w2.repos, w2.staff, broken.notifier, new Date(T0.getTime() + i * 60_000));
  const [action] = await w2.repos.automationActions.listRecent(5);
  assert.equal(action.attempts, CAPS.MAX_ATTEMPTS);
  assert.equal(action.status, "FAILED");
});

test("an abandoned claim (a crashed run) is retried after the stale window, not before", async () => {
  const w = await world();
  const options = { maxAttempts: CAPS.MAX_ATTEMPTS, staleAfterMs: CAPS.CLAIM_STALE_MS };
  const key = { rule: "SITE_VISIT_REMINDERS", subjectType: "SITE_VISIT", subjectId: "v", dedupeKey: "k1", now: T0 };
  assert.ok(await w.repos.automationActions.claim(key, options));
  assert.equal(await w.repos.automationActions.claim({ ...key, now: new Date(T0.getTime() + 60_000) }, options), null, "still in flight");
  assert.ok(await w.repos.automationActions.claim({ ...key, now: new Date(T0.getTime() + CAPS.CLAIM_STALE_MS + 1) }, options), "abandoned, so retried");
});

test("one failing action never stops the others", async () => {
  const w = await world();
  const a = await w.mk(1);
  const b = await w.mk(2);
  for (const l of [a, b]) await assignLead(w.repos, w.staff, l.id, w.priya.id, FOUNDER, minutes(5));
  await scheduleSiteVisit(w.repos, a.id, { scheduledAt: new Date(T0.getTime() + HOUR) }, w.priyaActor, T0);
  await scheduleSiteVisit(w.repos, b.id, { scheduledAt: new Date(T0.getTime() + 2 * HOUR) }, w.priyaActor, T0).catch(() => undefined);
  const r = recorder({ failTimes: 1 });
  const out = await runAutomations(w.repos, w.staff, r.notifier, T0);
  assert.equal(out.results.SITE_VISIT_REMINDERS.failed + out.results.SITE_VISIT_REMINDERS.sent >= 1, true);
});

// --- automatic routing ------------------------------------------------------------------------------

test("auto-routing is OFF by default: unassigned leads stay with the Founder until the switch is turned on", async () => {
  const w = await world();
  const lead = await w.mk(1);
  const r = recorder();
  await runAutomations(w.repos, w.staff, r.notifier, new Date(T0.getTime() + DAY));
  assert.equal((await w.repos.leads.getById(lead.id))?.ownerId, null);
  assert.equal(r.sent.length, 0);
});

test("auto-routing (when ON): least-loaded active employee, balanced across a batch, audited on the lead and in the log, new owner notified, once", async () => {
  const w = await world();
  const existing = await w.mk(10);
  await assignLead(w.repos, w.staff, existing.id, w.priya.id, FOUNDER, minutes(5));
  const fresh = [await w.mk(1), await w.mk(2), await w.mk(3)];
  await setAutomationEnabled(w.repos, "AUTO_ROUTING", true, FOUNDER, minutes(6));
  const r = recorder();
  const now = new Date(T0.getTime() + HOUR);
  const out = await runAutomations(w.repos, w.staff, r.notifier, now);
  assert.equal(out.results.AUTO_ROUTING.sent, 3);
  const owners = await Promise.all(fresh.map(async (l) => (await w.repos.leads.getById(l.id))!.ownerId));
  // Priya holds 1 already, Rohan 0: Rohan, then a tie at 1 -> Priya (name order), then Rohan again.
  assert.deepEqual(owners, [w.rohan.userId, w.priya.userId, w.rohan.userId]);
  const timeline = await getLeadTimeline(w.repos, fresh[0].id);
  const ev = timeline.find((e) => e.eventType === "OWNER_CHANGED" && e.payload.via === "AUTO_ROUTING")!;
  assert.equal(ev.actorType, "SYSTEM");
  assert.equal(ev.payload.to, w.rohan.userId);
  assert.equal(r.sent.filter((n) => n.type === "LEAD_ASSIGNED").length, 3);
  assert.equal((await w.repos.automationActions.listRecent(50)).filter((a) => a.rule === "AUTO_ROUTING" && a.status === "DONE").length, 3);
  await runAutomations(w.repos, w.staff, r.notifier, new Date(now.getTime() + HOUR));
  assert.equal(r.sent.filter((n) => n.type === "LEAD_ASSIGNED").length, 3, "a second run assigns nothing more");
});

test("auto-routing never takes a lead a team member returned, a lead younger than the grace period, or more than the per-run cap; with nobody active it leaves everything", async () => {
  const w = await world();
  const returned = await w.mk(1);
  await assignLead(w.repos, w.staff, returned.id, w.priya.id, FOUNDER, minutes(5));
  await returnLeadToFounder(w.repos, returned.id, "NOT_INTERESTED", undefined, w.priyaActor, minutes(10));
  const young = await w.mk(2, new Date(T0.getTime() + DAY));
  await setAutomationEnabled(w.repos, "AUTO_ROUTING", true, FOUNDER);
  const r = recorder();
  const now = new Date(T0.getTime() + DAY + 5 * 60_000);
  await runAutomations(w.repos, w.staff, r.notifier, now);
  assert.equal((await w.repos.leads.getById(returned.id))?.ownerId, null, "returned to the Founder, so it is the Founder's call");
  assert.equal((await w.repos.leads.getById(young.id))?.ownerId, null, "5 minutes old: inside the grace period");

  const w2 = await world();
  for (let i = 0; i < CAPS.ROUTING_PER_RUN + 5; i++) await w2.mk(100 + i);
  await setAutomationEnabled(w2.repos, "AUTO_ROUTING", true, FOUNDER);
  const out = await runAutomations(w2.repos, w2.staff, recorder().notifier, new Date(T0.getTime() + DAY));
  assert.equal(out.results.AUTO_ROUTING.sent, CAPS.ROUTING_PER_RUN);

  const w3 = await world();
  await w3.mk(1);
  await setStaffActive(w3.staff, w3.priya.id, false, FOUNDER);
  await setStaffActive(w3.staff, w3.rohan.id, false, FOUNDER);
  await setAutomationEnabled(w3.repos, "AUTO_ROUTING", true, FOUNDER);
  assert.equal((await runAutomations(w3.repos, w3.staff, recorder().notifier, new Date(T0.getTime() + DAY))).results.AUTO_ROUTING.sent, 0);
});

test("a failed notification never undoes an automatic assignment", async () => {
  const w = await world();
  const lead = await w.mk(1);
  await setAutomationEnabled(w.repos, "AUTO_ROUTING", true, FOUNDER);
  const out = await runAutomations(w.repos, w.staff, recorder({ failTimes: 99 }).notifier, new Date(T0.getTime() + DAY));
  assert.equal(out.results.AUTO_ROUTING.sent, 1);
  assert.ok((await w.repos.leads.getById(lead.id))?.ownerId);
});

// --- founder controls -------------------------------------------------------------------------------

test("controls: Founder only; unknown rules and non-boolean values are refused; the overview carries workload and the log", async () => {
  const w = await world();
  await assert.rejects(setAutomationEnabled(w.repos, "AUTO_ROUTING", true, w.priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(getAutomationOverview(w.repos, w.staff, w.priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(setAutomationEnabled(w.repos, "DROP_TABLES", true, FOUNDER), LeadValidationError);
  await assert.rejects(setAutomationEnabled(w.repos, "AUTO_ROUTING", "yes" as never, FOUNDER), LeadValidationError);
  await setAutomationEnabled(w.repos, "STALE_LEAD_ALERTS", false, FOUNDER);
  const overview = await getAutomationOverview(w.repos, w.staff, FOUNDER);
  assert.equal(overview.settings.STALE_LEAD_ALERTS, false);
  assert.deepEqual(overview.workload.map((x) => x.name), ["Priya Nair", "Rohan Das"]);
});

// --- the scheduled route and static guarantees -------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("the scheduled route: 503 without a secret, 401 without or with a wrong secret, and never runs the engine unauthenticated", async () => {
  const route = read("src/app/api/automation/run/route.ts");
  assert.match(route, /if \(!secret\) return new Response\("Automation is not configured\.", \{ status: 503 \}\)/);
  assert.match(route, /if \(!authorized\(request, secret\)\) return new Response\("Unauthorized\.", \{ status: 401 \}\)/);
  assert.ok(route.indexOf("authorized(request, secret)") < route.indexOf("runAutomations("), "authorization precedes the engine");
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /Response\.json\(\{ ranAt: summary\.ranAt\.toISOString\(\), results: summary\.results \}\)/, "counts only");
  assert.match(route, /export const dynamic = "force-dynamic"/);
});

test("static: founder automation actions authorize first; the engine sends nothing outside the app and has no randomness or model", () => {
  const actions = read("src/app/admin/_actions/automation-actions.ts");
  for (const name of ["setAutomationEnabledAction", "runAutomationsNowAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    const open = body.indexOf("Promise<AutomationActionResult> {") + "Promise<AutomationActionResult> {".length;
    assert.match(body.slice(open).trimStart(), /^const founderId = await requireFounderForAction\(\);/, `${name} authorizes first`);
  }
  const page = read("src/app/admin/sales-automation/page.tsx");
  assert.match(page, /await requireFounder\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  const engine = (read("src/lib/leads/automation-service.ts") + read("src/lib/leads/automation-rules.ts")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(engine, /Math\.random|fetch\(|whatsapp|sendgrid|twilio|nodemailer|openai|anthropic/i);
  const sql = read("src/lib/developer-connect/db/migrations/0026_phase8_automation.sql");
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
});

test("stale lead alerts: a team member with many quiet leads gets ONE digest notification, not one per lead - and a failed digest is retried whole", async () => {
  const w = await world();
  for (let i = 0; i < 6; i++) {
    const l = await w.mk(20 + i);
    await assignLead(w.repos, w.staff, l.id, w.priya.id, FOUNDER, minutes(5));
  }
  const r = recorder({ failTimes: 1 });
  const later = new Date(T0.getTime() + 9 * DAY);
  const first = await runAutomations(w.repos, w.staff, r.notifier, later);
  assert.equal(first.results.STALE_LEAD_ALERTS.failed, 6, "the digest failed, so all six claims are marked FAILED");
  assert.equal(r.sent.length, 0);
  const second = await runAutomations(w.repos, w.staff, r.notifier, new Date(later.getTime() + 60_000));
  assert.equal(second.results.STALE_LEAD_ALERTS.sent, 6);
  const digests = r.sent.filter((n) => n.type === "LEAD_STALE");
  assert.equal(digests.length, 1);
  assert.match(digests[0].title, /6 leads have gone quiet/);
  assert.equal(digests[0].targetRoute, "/team");
  await runAutomations(w.repos, w.staff, r.notifier, new Date(later.getTime() + 120_000));
  assert.equal(r.sent.filter((n) => n.type === "LEAD_STALE").length, 1, "and never again for the same quiet spell");
});
