import { DEFAULT_QUEUE_LIMIT, LEADS_PAGE_SIZE } from "./queue-config.ts";
import { endOfDayIn, followUpState, type FollowUpState, type LeadCounts, type LeadListQuery } from "./lead-views.ts";
import { buildTodayQueue, type TodayQueueEntry, type TodayQueueInput } from "./today-queue.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Booking, Lead, LeadActivitySummary, LeadConsent, LeadEvent, MarketingTouch } from "./types.ts";

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
  /** Distinct developers the buyer asked to be connected with, first-asked first. */
  developersViewed: string[];
  followUp: FollowUpState | null;
}

/** Everything the lead detail screen shows, or null when there is no such lead. Touches are distinct rows, so first and latest touch are never conflated. */
export async function getLeadDetail(repos: LeadRepositories, leadId: string, now: Date = new Date()): Promise<LeadDetail | null> {
  const lead = await repos.leads.getById(leadId);
  if (!lead) return null;
  const [events, firstTouch, lastTouch, consents, bookings, names] = await Promise.all([
    repos.events.listByLead(leadId),
    lead.firstTouchId ? repos.touches.getById(lead.firstTouchId) : Promise.resolve(null),
    lead.lastTouchId ? repos.touches.getById(lead.lastTouchId) : Promise.resolve(null),
    repos.consents.listByLead(leadId),
    repos.bookings.listByLead(leadId),
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
    developersViewed: viewed,
    followUp: followUpState(lead.nextFollowUpAt, now, endOfDayIn(now)),
  };
}
