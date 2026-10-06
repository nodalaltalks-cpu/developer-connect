import { DEFAULT_QUEUE_LIMIT, LEADS_PAGE_SIZE } from "./queue-config.ts";
import { endOfDayIn, followUpState, type FollowUpState, type LeadCounts, type LeadListQuery } from "./lead-views.ts";
import { buildTodayQueue, type TodayQueueEntry, type TodayQueueInput } from "./today-queue.ts";
import { canViewLead } from "./lead-access.ts";
import { MissedFollowUpBlockError, UnauthorizedLeadActionError } from "./errors.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Booking, Lead, LeadActivitySummary, LeadActor, LeadCall, LeadConsent, LeadEvent, LeadFollowUp, LeadRequirement, MarketingTouch } from "./types.ts";

/**
 * Read models for the founder's Leads screens. Read-only: nothing here writes.
 * Authorization is the CALLER's job (the pages call requireFounder first) —
 * these functions return private lead data and must never be reachable from a
 * public route (src/lib/leads/__tests__/boundaries.test.ts guards that).
 *
 * Every list is bounded and uses batch lookups (one summary query and one
 * developer-name query for the whole page), so cost does not grow per row.
 */

export interface LeadListItem {
  lead: Lead;
  /** The developer the buyer first researched, for display. */
  developerName: string | null;
  summary: LeadActivitySummary | null;
  /** Why the Today queue put this lead here; null outside the attention view. */
  attention: Pick<TodayQueueEntry, "bucket" | "reasons" | "summary"> | null;
  followUp: FollowUpState | null;
}

export interface LeadsPage {
  items: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

async function toItems(
  repos: LeadRepositories,
  leads: Lead[],
  now: Date,
  attention: Map<string, TodayQueueEntry> = new Map(),
): Promise<LeadListItem[]> {
  if (leads.length === 0) return [];
  const endOfToday = endOfDayIn(now);
  const ids = leads.map((lead) => lead.id);
  const developerIds = [...new Set(leads.map((lead) => lead.developerId).filter((id): id is string => id !== null))];
  const [summaries, names] = await Promise.all([repos.events.summarise(ids), repos.leads.developerNames(developerIds)]);
  const summaryByLead = new Map(summaries.map((summary) => [summary.leadId, summary]));

  return leads.map((lead) => {
    const summary = summaryByLead.get(lead.id) ?? null;
    const entry = attention.get(lead.id) ?? null;
    return {
      lead,
      developerName: (lead.developerId ? names[lead.developerId] : null) ?? summary?.firstDeveloperName ?? null,
      summary,
      attention: entry ? { bucket: entry.bucket, reasons: entry.reasons, summary: entry.summary } : null,
      followUp: followUpState(lead.nextFollowUpAt, now, endOfToday),
    };
  });
}

/** "What needs my attention?" — the existing Today queue (no second scoring system), with its reasons. */
export async function getAttentionItems(
  repos: LeadRepositories,
  now: Date = new Date(),
  limit: number = DEFAULT_QUEUE_LIMIT,
): Promise<LeadListItem[]> {
  const leads = await repos.leads.listForQueue(1000);
  const summaries = await repos.events.summarise(leads.map((lead) => lead.id));
  const summaryByLead = new Map(summaries.map((summary) => [summary.leadId, summary]));
  const inputs: TodayQueueInput[] = leads.map((lead) => {
    const summary = summaryByLead.get(lead.id) ?? null;
    return { lead, developerName: summary?.firstDeveloperName ?? null, summary };
  });
  const entries = buildTodayQueue(inputs, now, limit);
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const ordered = entries.map((entry) => byId.get(entry.leadId)).filter((lead): lead is Lead => lead !== undefined);
  return toItems(repos, ordered, now, new Map(entries.map((entry) => [entry.leadId, entry])));
}

export async function getLeadsPage(
  repos: LeadRepositories,
  view: LeadListQuery["view"],
  page: number,
  now: Date = new Date(),
  pageSize: number = LEADS_PAGE_SIZE,
): Promise<LeadsPage> {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const result = await repos.leads.list({ view, limit: pageSize, offset: (safePage - 1) * pageSize, now, endOfToday: endOfDayIn(now) });
  return {
    items: await toItems(repos, result.leads, now),
    total: result.total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}

export async function getLeadCounts(repos: LeadRepositories, now: Date = new Date()): Promise<LeadCounts> {
  return repos.leads.counts(now, endOfDayIn(now));
}

export interface LeadDetail {
  lead: Lead;
  developerName: string | null;
  /** Oldest first. */
  events: LeadEvent[];
  firstTouch: MarketingTouch | null;
  lastTouch: MarketingTouch | null;
  consents: LeadConsent[];
  bookings: Booking[];
  /** The lead's structured requirement history, newest first; the ACTIVE one (if any) is the current requirement. */
  requirements: LeadRequirement[];
  /** Every follow-up the lead has had, newest first. The open one (scheduled or missed) is the one needing action. */
  followUps: LeadFollowUp[];
  /** Every call placed to the lead through the internal dialer, newest first. */
  calls: LeadCall[];
  /** Distinct developers the buyer asked to be connected with, first-asked first. */
  developersViewed: string[];
  followUp: FollowUpState | null;
}

/** Everything the lead detail screen shows, or null when there is no such lead. Touches are distinct rows, so first and latest touch are never conflated. */
export async function getLeadDetail(repos: LeadRepositories, leadId: string, now: Date = new Date()): Promise<LeadDetail | null> {
  const lead = await repos.leads.getById(leadId);
  if (!lead) return null;
  const [events, firstTouch, lastTouch, consents, bookings, requirements, followUps, calls, names] = await Promise.all([
    repos.events.listByLead(leadId),
    lead.firstTouchId ? repos.touches.getById(lead.firstTouchId) : Promise.resolve(null),
    lead.lastTouchId ? repos.touches.getById(lead.lastTouchId) : Promise.resolve(null),
    repos.consents.listByLead(leadId),
    repos.bookings.listByLead(leadId),
    repos.requirements.listByLead(leadId),
    repos.followUps.listByLead(leadId),
    repos.calls.listByLead(leadId),
    lead.developerId ? repos.leads.developerNames([lead.developerId]) : Promise.resolve({} as Record<string, string>),
  ]);

  const viewed: string[] = [];
  for (const event of events) {
    const name = event.eventType === "DEVELOPER_CONNECT_REQUESTED" || event.eventType === "OFFICIAL_WEBSITE_CLICKED" ? event.payload.developerName : null;
    if (typeof name === "string" && !viewed.includes(name)) viewed.push(name);
  }

  return {
    lead,
    developerName: (lead.developerId ? names[lead.developerId] : null) ?? viewed[0] ?? null,
    events,
    firstTouch,
    lastTouch,
    consents,
    bookings,
    requirements,
    followUps,
    calls,
    developersViewed: viewed,
    followUp: followUpState(lead.nextFollowUpAt, now, endOfDayIn(now)),
  };
}

/**
 * The lead detail for a specific ACTOR, or null — and null is also the answer for a lead the actor may not see, so
 * an id that is not theirs is indistinguishable from one that does not exist. The Founder sees everything. A team
 * member sees only a lead they own, and never its bookings (commission figures are the Founder's).
 */
export async function getLeadDetailForActor(
  repos: LeadRepositories,
  actor: LeadActor,
  leadId: string,
  now: Date = new Date(),
): Promise<LeadDetail | null> {
  const lead = await repos.leads.getById(leadId);
  if (!lead || !canViewLead(actor, lead)) return null;
  const detail = await getLeadDetail(repos, leadId, now);
  if (!detail) return null;
  return actor.actorType === "FOUNDER" ? detail : { ...detail, bookings: [] };
}

/** The filters on a team member's "My Leads". */
export const MY_LEAD_VIEWS = ["all", "new", "follow_up_due", "hot", "missed"] as const;
export type MyLeadView = (typeof MY_LEAD_VIEWS)[number];

/**
 * A team member's own leads — and ONLY theirs: the owner id comes from the verified actor, never from a caller
 * argument, and the repository ANDs it onto every view. Erased leads are never listed. Anything that is not an
 * EMPLOYEE actor with an id is refused before any read.
 */
export interface MyLeadsPage extends LeadsPage {
  /** True when unresolved missed follow-ups limited the list to the leads that have one (the discipline rule). */
  restrictedToMissed: boolean;
}

export async function getMyLeadsPage(
  repos: LeadRepositories,
  actor: LeadActor,
  view: MyLeadView,
  page: number,
  now: Date = new Date(),
  pageSize: number = LEADS_PAGE_SIZE,
): Promise<MyLeadsPage> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) {
    throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  }
  // While this team member has unresolved missed follow-ups, the server shows only the leads that have one — whatever
  // view was asked for. (They resolve each by completing, rescheduling, cancelling with a reason, or returning it.)
  const misses = await repos.followUps.listUnresolvedMissed({ ownerId: actor.actorId, now, limit: 500 });
  if (misses.length > 0) {
    const items = await toItems(repos, misses.map((row) => row.lead), now);
    return { items, total: items.length, page: 1, pageSize, pageCount: 1, restrictedToMissed: true };
  }
  const safeView: MyLeadView = (MY_LEAD_VIEWS as readonly string[]).includes(view) && view !== "missed" ? view : "all";
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const result = await repos.leads.list({
    view: safeView,
    ownerId: actor.actorId,
    limit: pageSize,
    offset: (safePage - 1) * pageSize,
    now,
    endOfToday: endOfDayIn(now),
  });
  return {
    items: await toItems(repos, result.leads, now),
    total: result.total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    restrictedToMissed: false,
  };
}

/** What a team member sees of one lead: contact, requirement, interest, timeline and follow-up — no attribution, consent records or bookings. */
export interface MyLeadDetail {
  lead: Lead;
  developerName: string | null;
  /** Oldest first. */
  events: LeadEvent[];
  /** This lead's requirement history, newest first. */
  requirements: LeadRequirement[];
  /** This lead's follow-up history, newest first. */
  followUps: LeadFollowUp[];
  /** Calls placed to this lead through the internal dialer, newest first. */
  calls: LeadCall[];
  developersViewed: string[];
  followUp: FollowUpState | null;
}

/**
 * One lead for the team member who owns it, or null — also null for a lead that is someone else's, erased or
 * missing, so the three are indistinguishable. The shape is deliberately narrower than LeadDetail: fields an
 * employee has no need for are never loaded into their page at all.
 */
export async function getMyLeadDetail(
  repos: LeadRepositories,
  actor: LeadActor,
  leadId: string,
  now: Date = new Date(),
): Promise<MyLeadDetail | null> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) {
    throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  }
  const detail = await getLeadDetailForActor(repos, actor, leadId, now);
  if (!detail) return null;
  // Same discipline rule as the list: with unresolved misses, only a lead that has one can be opened.
  const misses = await repos.followUps.listUnresolvedMissed({ ownerId: actor.actorId, now, limit: 500 });
  if (misses.length > 0 && !misses.some((row) => row.followUp.leadId === leadId)) throw new MissedFollowUpBlockError(misses.length);
  return {
    lead: detail.lead,
    developerName: detail.developerName,
    // Booking events carry money figures; those stay the Founder's.
    events: detail.events.filter((event) => event.eventType !== "BOOKING_CREATED" && event.eventType !== "BOOKING_UPDATED"),
    requirements: detail.requirements,
    followUps: detail.followUps,
    calls: detail.calls,
    developersViewed: detail.developersViewed,
    followUp: detail.followUp,
  };
}
