import { toMetrics, parseInsightFilters, type CallMetrics } from "./call-analytics.ts";
import { UnauthorizedLeadActionError } from "./errors.ts";
import { BUSINESS_TIME_ZONE } from "./format.ts";
import type { LeadRepositories } from "./repository.ts";
import type { LeadActor } from "./types.ts";
import type { StaffRepository } from "../staff/repository.ts";

/**
 * What a team member can see about performance. Two read models, both derived from the same records the Founder's
 * profile uses (nothing typed in, nothing editable):
 *  - getMyPerformance: ONLY the signed-in member's own numbers. The id is the actor's, never an argument.
 *  - getTeamBoard: every active member's headline activity, for people the Founder has given the "Team board" tab.
 *    No lead names, no phone numbers, no booking or revenue figures, and nothing about the Founder.
 */

function assertMember(actor: LeadActor): asserts actor is LeadActor & { actorId: string } {
  if (!actor.actorId || (actor.actorType !== "EMPLOYEE" && actor.actorType !== "FOUNDER")) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
}

export interface MyPerformance {
  rangeLabel: string;
  calls: CallMetrics;
  followUps: { created: number; completed: number; missedNow: number };
  siteVisits: { scheduled: number; completed: number; noShow: number };
  requirementsCreated: number;
  projectsShortlisted: number;
  leadsReturned: number;
  /** Leads they own right now (a snapshot, not tied to the range). */
  openLeads: number;
  /** Bookings on leads they own now, per currency (never summed across currencies). */
  bookings: Array<{ currency: string; total: number; count: number }>;
}

export async function getMyPerformance(repos: LeadRepositories, actor: LeadActor, rangeInput: { range?: string; from?: string; to?: string }, now: Date = new Date()): Promise<MyPerformance> {
  assertMember(actor);
  const me = actor.actorId;
  const { range } = parseInsightFilters({ range: rangeInput.range ?? "last7", from: rangeInput.from, to: rangeInput.to }, now);
  const [callRows, followUps, visits, requirements, shortlists, returned, open, revenue] = await Promise.all([
    repos.calls.aggregate({ from: range.from, to: range.to, groupBy: "EMPLOYEE", timeZone: BUSINESS_TIME_ZONE, staffUserId: me }),
    repos.followUps.statsByStaff(range.from, range.to, now),
    repos.siteVisits.statsByStaff(range.from, range.to),
    repos.events.countByTypeAndActor("REQUIREMENT_CREATED", range.from, range.to),
    repos.events.countByTypeAndActor("PROJECT_SHORTLISTED", range.from, range.to),
    repos.events.countByTypeAndActor("RETURNED_TO_FOUNDER", range.from, range.to),
    repos.leads.countOpenByOwner(),
    repos.bookings.revenueByOwner(),
  ]);
  return {
    rangeLabel: range.label,
    calls: toMetrics(callRows[0]),
    followUps: followUps[me] ?? { created: 0, completed: 0, missedNow: 0 },
    siteVisits: visits[me] ?? { scheduled: 0, completed: 0, noShow: 0 },
    requirementsCreated: requirements[me] ?? 0,
    projectsShortlisted: shortlists[me] ?? 0,
    leadsReturned: returned[me] ?? 0,
    openLeads: open[me] ?? 0,
    bookings: revenue.filter((r) => r.ownerId === me).map(({ currency, total, count }) => ({ currency, total, count })),
  };
}

export interface TeamBoardRow {
  employeeId: string;
  name: string;
  isMe: boolean;
  dialed: number;
  connected: number;
  talkSeconds: number;
  followUpsCompleted: number;
  openLeads: number;
}

export async function getTeamBoard(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, rangeInput: { range?: string; from?: string; to?: string }, now: Date = new Date()): Promise<{ rangeLabel: string; rows: TeamBoardRow[] }> {
  assertMember(actor);
  const { range } = parseInsightFilters({ range: rangeInput.range ?? "last7", from: rangeInput.from, to: rangeInput.to }, now);
  const [members, callRows, followUps, open] = await Promise.all([
    staff.list(),
    repos.calls.aggregate({ from: range.from, to: range.to, groupBy: "EMPLOYEE", timeZone: BUSINESS_TIME_ZONE }),
    repos.followUps.statsByStaff(range.from, range.to, now),
    repos.leads.countOpenByOwner(),
  ]);
  const calls = new Map(callRows.map((r) => [r.key, toMetrics(r)]));
  const rows = members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => {
      const c = calls.get(m.userId) ?? toMetrics(null);
      return {
        employeeId: m.employeeId,
        name: m.displayName,
        isMe: m.userId === actor.actorId,
        dialed: c.dialed,
        connected: c.connected,
        talkSeconds: c.talkSeconds,
        followUpsCompleted: followUps[m.userId]?.completed ?? 0,
        openLeads: open[m.userId] ?? 0,
      };
    })
    // By employee ID, never by results: this is a shared view of activity, not a ranking.
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }));
  return { rangeLabel: range.label, rows };
}
