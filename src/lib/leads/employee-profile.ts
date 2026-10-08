import { UnauthorizedLeadActionError } from "./errors.ts";
import { toMetrics, type CallMetrics } from "./call-analytics.ts";
import { assignLead } from "./lead-service.ts";
import { BUSINESS_TIME_ZONE } from "./format.ts";
import type { CallWithLead, LeadRepositories } from "./repository.ts";
import type { Lead, LeadActor, LeadCurrency, LeadEvent } from "./types.ts";
import { parseEmployeeId } from "../staff/identity.ts";
import type { StaffRepository } from "../staff/repository.ts";
import type { StaffEvent, StaffMember } from "../staff/types.ts";

/**
 * The Founder's complete record of one person, found by their permanent employee ID. Founder only - an employee never
 * reaches another employee's profile (there is no route, no action and no read that takes anyone's id but the Founder's).
 *
 * Everything is attributed by the person's sign-in id, which every historical record (lead events, calls, follow-ups,
 * visits, ownership) already carries, so it stays correct after they exit: nothing is rewritten, nothing is deleted, and
 * the figures below keep counting what they did. Reads are aggregates and bounded pages - never a full history load.
 */

const EPOCH = new Date("2020-01-01T00:00:00Z");
const DAY = 86_400_000;
export const HISTORY_PAGE = 25;

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
}

export interface EmployeeProfile {
  member: StaffMember;
  lifecycle: StaffEvent[];
  sales: {
    openLeads: number;
    ownedLeads: number;
    leadsEverAssigned: number;
    leadsActedOn: number;
    leadsReturned: number;
    calls: CallMetrics;
    followUps: { created: number; completed: number; missedNow: number };
    requirementsCreated: number;
    projectsShortlisted: number;
    siteVisits: { scheduled: number; completed: number; noShow: number };
    /** Bookings and booking value on the leads they own now, per currency (never summed across currencies). */
    revenue: Array<{ currency: LeadCurrency | string; total: number; count: number }>;
  };
  recentCalls: CallWithLead[];
  /** The newest page of what they did. Ask for the next page with `before`. */
  history: LeadEvent[];
  /** Their currently owned open leads, quietest first, for review/reassignment (bounded). */
  openLeadSample: Lead[];
}

export type ProfileLookup = { kind: "FOUNDER" } | { kind: "NOT_FOUND" } | { kind: "EMPLOYEE"; profile: EmployeeProfile };

export async function getEmployeeProfile(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, rawId: string, now: Date = new Date()): Promise<ProfileLookup> {
  assertFounder(actor);
  const id = parseEmployeeId(rawId);
  if (!id) return { kind: "NOT_FOUND" };
  if (id === "DC1") return { kind: "FOUNDER" };
  const member = await staff.getByEmployeeId(id);
  if (!member) return { kind: "NOT_FOUND" };
  const userId = member.userId;
  const to = new Date(now.getTime() + DAY);

  const [lifecycle, callRows, followUps, visits, requirements, shortlists, returned, counts, openCounts, owned, revenue, recentCalls, history, openLeads] = await Promise.all([
    staff.listEvents(member.id, 200),
    repos.calls.aggregate({ from: EPOCH, to, groupBy: "EMPLOYEE", timeZone: BUSINESS_TIME_ZONE, staffUserId: userId }),
    repos.followUps.statsByStaff(EPOCH, to, now),
    repos.siteVisits.statsByStaff(EPOCH, to),
    repos.events.countByTypeAndActor("REQUIREMENT_CREATED", EPOCH, to),
    repos.events.countByTypeAndActor("PROJECT_SHORTLISTED", EPOCH, to),
    repos.events.countByTypeAndActor("RETURNED_TO_FOUNDER", EPOCH, to),
    repos.events.actorLeadCounts(userId),
    repos.leads.countOpenByOwner(),
    repos.leads.countByOwner(),
    repos.bookings.revenueByOwner(),
    repos.calls.listRecent({ staffUserId: userId, limit: 10 }),
    repos.events.listByActor(userId, { limit: HISTORY_PAGE }),
    repos.leads.list({ view: "all", ownerId: userId, limit: 25, offset: 0, now, endOfToday: to }),
  ]);

  return {
    kind: "EMPLOYEE",
    profile: {
      member,
      lifecycle,
      sales: {
        openLeads: openCounts[userId] ?? 0,
        ownedLeads: owned[userId] ?? 0,
        leadsEverAssigned: counts.leadsAssignedTo,
        leadsActedOn: counts.leadsActedOn,
        leadsReturned: returned[userId] ?? 0,
        calls: toMetrics(callRows[0]),
        followUps: followUps[userId] ?? { created: 0, completed: 0, missedNow: 0 },
        requirementsCreated: requirements[userId] ?? 0,
        projectsShortlisted: shortlists[userId] ?? 0,
        siteVisits: visits[userId] ?? { scheduled: 0, completed: 0, noShow: 0 },
        revenue: revenue.filter((r) => r.ownerId === userId).map(({ currency, total, count }) => ({ currency, total, count })),
      },
      recentCalls,
      history,
      openLeadSample: openLeads.leads,
    },
  };
}

/** The next page of what a person did (Founder only). */
export async function getEmployeeHistoryPage(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, rawId: string, before: Date): Promise<LeadEvent[]> {
  assertFounder(actor);
  const id = parseEmployeeId(rawId);
  const member = id && id !== "DC1" ? await staff.getByEmployeeId(id) : null;
  if (!member) return [];
  return repos.events.listByActor(member.userId, { limit: HISTORY_PAGE, before });
}

const MAX_RETURN = 500;

/**
 * Hands every open lead an (exited, inactive or any) team member still owns back to the Founder queue (Founder only).
 * History is never rewritten: each lead gets a new OWNER_CHANGED event "from them to nobody" by the Founder, so the
 * timeline reads "owned by DC3 -> returned to the Founder queue". Their calls, notes, follow-ups, requirements and
 * visits on those leads stay attributed to them.
 */
export async function returnOpenLeadsToFounder(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, rawId: string, now: Date = new Date()): Promise<{ returned: number; remaining: number }> {
  assertFounder(actor);
  const id = parseEmployeeId(rawId);
  const member = id && id !== "DC1" ? await staff.getByEmployeeId(id) : null;
  if (!member) return { returned: 0, remaining: 0 };
  const { leads } = await repos.leads.list({ view: "all", ownerId: member.userId, limit: MAX_RETURN, offset: 0, now, endOfToday: new Date(now.getTime() + DAY) });
  let returned = 0;
  for (const lead of leads) {
    if (lead.ownerId !== member.userId) continue;
    await assignLead(repos, staff, lead.id, null, actor, now);
    returned += 1;
  }
  const owned = (await repos.leads.countByOwner())[member.userId] ?? 0;
  return { returned, remaining: owned };
}
