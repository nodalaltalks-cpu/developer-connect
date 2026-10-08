import { UnauthorizedLeadActionError } from "./errors.ts";
import { notifyDueFollowUps, sweepMissedFollowUps, type LeadNotifier } from "./follow-up-service.ts";
import { endOfDayIn } from "./lead-views.ts";
import type { FollowUpWithLead, LeadRepositories } from "./repository.ts";
import type { LeadActor } from "./types.ts";

/**
 * THE FOLLOW-UP BOARD: a team member's follow-ups in four plain tabs, from the follow-up records and nothing else.
 *
 *   TODAY     scheduled for the rest of today (including calls due right now)
 *   OVERDUE   the time passed TODAY and it has not been resolved yet
 *   MISSED    the time passed on an EARLIER day and it has not been resolved
 *   UPCOMING  scheduled after today, within the next two weeks
 *
 * Overdue and Missed are both "unresolved and past due"; the split is only how long ago, so the oldest ones stand out. Nothing
 * here decides anything: resolving (complete, reschedule, cancel with a reason, return) is done through the follow-up service,
 * and the existing discipline rule (unresolved misses close the rest of the workspace) is unchanged.
 */

export const FOLLOW_UP_TABS = ["today", "overdue", "upcoming", "missed"] as const;
export type FollowUpTab = (typeof FOLLOW_UP_TABS)[number];

export const UPCOMING_DAYS = 14;
const LIMIT = 200;

export function parseFollowUpTab(value: unknown): FollowUpTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return (FOLLOW_UP_TABS as readonly string[]).includes(raw as string) ? (raw as FollowUpTab) : "today";
}

export interface FollowUpBoard {
  tab: FollowUpTab;
  counts: Record<FollowUpTab, number>;
  items: FollowUpWithLead[];
}

/** Splits unresolved past-due follow-ups at the start of the business day: today = overdue, earlier = missed. Pure. */
export function splitUnresolved(rows: readonly FollowUpWithLead[], startOfToday: Date): { overdue: FollowUpWithLead[]; missed: FollowUpWithLead[] } {
  const overdue: FollowUpWithLead[] = [];
  const missed: FollowUpWithLead[] = [];
  for (const row of rows) (row.followUp.scheduledAt.getTime() >= startOfToday.getTime() ? overdue : missed).push(row);
  return { overdue, missed };
}

export async function getMyFollowUpBoard(repos: LeadRepositories, actor: LeadActor, tab: FollowUpTab, now: Date = new Date(), notifier?: LeadNotifier): Promise<FollowUpBoard> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const ownerId = actor.actorId;
  // Same sweeps as the workspace: a miss is recorded the moment it is noticed, and "due soon" is sent once.
  await sweepMissedFollowUps(repos, { ownerId }, now, notifier);
  await notifyDueFollowUps(repos, { ownerId }, now, notifier);

  const endOfToday = endOfDayIn(now);
  const startOfToday = new Date(endOfToday.getTime() - 24 * 3_600_000);
  const [unresolved, today, upcoming] = await Promise.all([
    repos.followUps.listUnresolvedMissed({ ownerId, now, limit: LIMIT }),
    repos.followUps.listScheduled({ ownerId, from: now, to: endOfToday, limit: LIMIT }),
    repos.followUps.listScheduled({ ownerId, from: endOfToday, to: new Date(endOfToday.getTime() + UPCOMING_DAYS * 24 * 3_600_000), limit: LIMIT }),
  ]);
  const { overdue, missed } = splitUnresolved(unresolved, startOfToday);
  const lists: Record<FollowUpTab, FollowUpWithLead[]> = { today, overdue, upcoming, missed };
  return {
    tab,
    counts: { today: today.length, overdue: overdue.length, upcoming: upcoming.length, missed: missed.length },
    items: lists[tab],
  };
}
