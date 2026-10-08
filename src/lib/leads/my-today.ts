import { listMyBatches, getCallingQueue } from "./calling-batch-service.ts";
import { UnauthorizedLeadActionError } from "./errors.ts";
import type { MyWorkItem, MyWorkState } from "./follow-up-reads.ts";
import { formatDateTimeFull } from "./format.ts";
import { endOfDayIn } from "./lead-views.ts";
import type { LeadRepositories } from "./repository.ts";
import { listOpenVisits } from "./site-visit-service.ts";
import type { Lead, LeadActor } from "./types.ts";

/**
 * TODAY: what a team member should do now, from their own records and nothing else.
 *
 * The NEXT BEST ACTION is a plain priority list, not a score and not a guess. The first rule that applies wins, and the reason is
 * always shown with it, so the employee (and the Founder) can see exactly why this lead is on top:
 *
 *   1. a follow-up was MISSED or is overdue   -> resolve it (other leads are closed until you do)
 *   2. a follow-up is DUE NOW                  -> make that call
 *   3. a site visit is within two hours or waiting for its outcome
 *   4. the NEXT CALL in an active calling list
 *   5. a NEW lead nobody has contacted yet
 *   6. a HOT lead that has been quiet for 24 hours
 *   7. a follow-up later today
 */

export type NextActionKind = "RESOLVE_MISSED" | "FOLLOW_UP_DUE" | "SITE_VISIT" | "NEXT_CALL" | "NEW_LEAD" | "HOT_QUIET" | "FOLLOW_UP_TODAY";

export interface NextBestAction {
  kind: NextActionKind;
  lead: Lead;
  /** One plain sentence: why this lead, why now. */
  reason: string;
  followUpId?: string;
  batchId?: string;
}

export interface MyTodayTiles {
  callsRemaining: number;
  followUpsDue: number;
  missed: number;
  newLeads: number;
  hotLeads: number;
  siteVisitsToday: number;
  requirementsNeeded: number;
}

export interface MyToday {
  tiles: MyTodayTiles;
  next: NextBestAction | null;
}

export interface NextActionCandidates {
  missed?: { lead: Lead; followUpId: string } | null;
  dueNow?: MyWorkItem | null;
  visit?: { lead: Lead; awaitingOutcome: boolean; whenLabel: string } | null;
  nextCall?: { lead: Lead; batchId: string } | null;
  newLead?: Lead | null;
  hotQuiet?: Lead | null;
  dueToday?: MyWorkItem | null;
}

/** Pure: the first applicable rule wins. */
export function chooseNextBestAction(c: NextActionCandidates): NextBestAction | null {
  if (c.missed) return { kind: "RESOLVE_MISSED", lead: c.missed.lead, followUpId: c.missed.followUpId, reason: "A follow-up was missed. Resolve it first: until you do, your other leads stay closed." };
  if (c.dueNow) return { kind: "FOLLOW_UP_DUE", lead: c.dueNow.lead, followUpId: c.dueNow.followUp.id, reason: "This follow-up is due right now." };
  if (c.visit) return { kind: "SITE_VISIT", lead: c.visit.lead, reason: c.visit.awaitingOutcome ? "A site visit has happened or is under way. Record what happened." : `A site visit is coming up ${c.visit.whenLabel}.` };
  if (c.nextCall) return { kind: "NEXT_CALL", lead: c.nextCall.lead, batchId: c.nextCall.batchId, reason: "Next in your calling list." };
  if (c.newLead) return { kind: "NEW_LEAD", lead: c.newLead, reason: "A new lead nobody has contacted yet." };
  if (c.hotQuiet) return { kind: "HOT_QUIET", lead: c.hotQuiet, reason: "A hot lead with no activity for 24 hours." };
  if (c.dueToday) return { kind: "FOLLOW_UP_TODAY", lead: c.dueToday.lead, followUpId: c.dueToday.followUp.id, reason: "A follow-up scheduled for later today." };
  return null;
}

const QUIET_MS = 24 * 3_600_000;
const SOON_MS = 2 * 3_600_000;

export async function getMyToday(repos: LeadRepositories, actor: LeadActor, work: MyWorkState, now: Date = new Date()): Promise<MyToday> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const ownerId = actor.actorId;
  const endOfToday = endOfDayIn(now);
  const query = (view: "new" | "hot", limit: number, offset = 0) => repos.leads.list({ view, ownerId, limit, offset, now, endOfToday });

  const [newest, hot, batches, visits, requirementsNeeded] = await Promise.all([
    query("new", 1),
    query("hot", 25),
    listMyBatches(repos, actor),
    listOpenVisits(repos, actor, now, 50),
    repos.leads.countOpenWithoutRequirement(ownerId),
  ]);

  // The OLDEST new lead has waited longest: read it from the far end of the list.
  const oldestNew = newest.total > 1 ? (await query("new", 1, newest.total - 1)).leads[0] : newest.leads[0];

  const active = batches.filter((b) => b.batch.status === "ACTIVE");
  const callsRemaining = active.reduce((n, b) => n + b.counts.pending + b.counts.skipped, 0);
  let nextCall: NextActionCandidates["nextCall"] = null;
  for (const { batch, counts } of active) {
    if (counts.pending + counts.skipped === 0) continue;
    const queue = await getCallingQueue(repos, actor, batch.id);
    if (queue?.next) {
      nextCall = { lead: queue.next.progress.lead, batchId: batch.id };
      break;
    }
  }

  const todaysVisits = visits.filter((v) => v.visit.scheduledAt.getTime() < endOfToday.getTime());
  const soonest = visits.find((v) => v.awaitingOutcome || v.visit.scheduledAt.getTime() - now.getTime() <= SOON_MS);
  const hotQuiet = hot.leads.find((l) => now.getTime() - l.lastActivityAt.getTime() >= QUIET_MS) ?? null;

  const next = chooseNextBestAction({
    missed: work.missed[0] ? { lead: work.missed[0].lead, followUpId: work.missed[0].followUp.id } : null,
    dueNow: work.dueNow[0] ?? null,
    visit: soonest ? { lead: soonest.lead, awaitingOutcome: soonest.awaitingOutcome, whenLabel: `at ${formatDateTimeFull(soonest.visit.scheduledAt)}` } : null,
    nextCall,
    newLead: oldestNew ?? null,
    hotQuiet,
    dueToday: work.dueToday[0] ?? null,
  });

  return {
    tiles: {
      callsRemaining,
      followUpsDue: work.dueNow.length + work.dueToday.length,
      missed: work.missed.length,
      newLeads: newest.total,
      hotLeads: hot.total,
      siteVisitsToday: todaysVisits.length,
      requirementsNeeded,
    },
    next,
  };
}
