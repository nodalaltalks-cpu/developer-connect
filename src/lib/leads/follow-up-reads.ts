import { MissedFollowUpBlockError, UnauthorizedLeadActionError } from "./errors.ts";
import { DUE_SOON_MINUTES, notifyDueFollowUps, sweepMissedFollowUps, type LeadNotifier } from "./follow-up-service.ts";
import { endOfDayIn } from "./lead-views.ts";
import { requirementOneLine } from "./requirement-view.ts";
import type { LeadRepositories } from "./repository.ts";
import { LEAD_STATUSES, type Lead, type LeadActivitySummary, type LeadActor, type LeadFollowUp, type LeadStatus, type LeadTemperature } from "./types.ts";

/**
 * Read models for follow-up discipline: the Missed Leads lists (a team member's own; the Founder's, filterable), the
 * Returned Leads queue, a team member's "what do I do now" state, and the Founder's attention counts. Read-only
 * except that loading them records any not-yet-recorded misses (idempotent), because a miss is a server fact.
 *
 * Scope is decided HERE from the verified actor: a team member's queries are always their own; filters a team member
 * supplies are ignored; nothing is read for BUYER/SYSTEM actors.
 */

const LIST_LIMIT = 200;

export interface MissedFollowUpItem {
  followUp: LeadFollowUp;
  lead: Lead;
  developerName: string | null;
  summary: LeadActivitySummary | null;
  /** The current requirement as one line, or null. */
  requirement: string | null;
  /** How long ago it was due, in milliseconds. */
  overdueMs: number;
}

export interface MissedFilters {
  /** Founder only: a team member's Clerk user id. */
  ownerId?: string;
  temperature?: LeadTemperature;
  status?: LeadStatus;
  from?: Date;
  to?: Date;
  minOverdueMs?: number;
}

async function toMissedItems(repos: LeadRepositories, rows: { followUp: LeadFollowUp; lead: Lead }[], now: Date): Promise<MissedFollowUpItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.lead.id);
  const developerIds = [...new Set(rows.map((row) => row.lead.developerId).filter((id): id is string => id !== null))];
  const [summaries, names, requirements] = await Promise.all([
    repos.events.summarise(ids),
    repos.leads.developerNames(developerIds),
    Promise.all(rows.map((row) => repos.requirements.getActiveByLead(row.lead.id))),
  ]);
  const summaryByLead = new Map(summaries.map((summary) => [summary.leadId, summary]));
  return rows.map((row, index) => {
    const summary = summaryByLead.get(row.lead.id) ?? null;
    return {
      followUp: row.followUp,
      lead: row.lead,
      developerName: (row.lead.developerId ? names[row.lead.developerId] : null) ?? summary?.firstDeveloperName ?? null,
      summary,
      requirement: requirements[index] ? requirementOneLine(requirements[index]!) : null,
      overdueMs: Math.max(0, now.getTime() - row.followUp.scheduledAt.getTime()),
    };
  });
}

/**
 * Unresolved missed follow-ups. A team member gets their own (always); the Founder gets everyone's and may filter by
 * employee, scheduled date range, minimum overdue time, lead temperature and lead status.
 */
export async function getMissedFollowUps(
  repos: LeadRepositories,
  actor: LeadActor,
  filters: MissedFilters,
  now: Date = new Date(),
  notifier?: LeadNotifier,
): Promise<MissedFollowUpItem[]> {
  const isEmployee = actor.actorType === "EMPLOYEE" && !!actor.actorId;
  const isFounder = actor.actorType === "FOUNDER" && !!actor.actorId;
  if (!isEmployee && !isFounder) throw new UnauthorizedLeadActionError("A signed-in team member is required.");

  const scope = isEmployee ? { ownerId: actor.actorId! } : filters.ownerId ? { ownerId: filters.ownerId } : {};
  await sweepMissedFollowUps(repos, scope, now, notifier);
  const f = isEmployee ? {} : filters;
  const rows = await repos.followUps.listUnresolvedMissed({
    ...scope,
    temperature: f.temperature,
    status: f.status,
    scheduledFrom: f.from,
    scheduledTo: f.to,
    overdueForAtLeastMs: f.minOverdueMs,
    now,
    limit: LIST_LIMIT,
  });
  return toMissedItems(repos, rows, now);
}

/** What the Founder's navigation shows: how many unresolved misses and returned leads need attention. Founder only. */
export async function getFounderAttention(repos: LeadRepositories, actor: LeadActor, now: Date = new Date()): Promise<{ missed: number; returned: number }> {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
  await sweepMissedFollowUps(repos, {}, now);
  const [missed, returned] = await Promise.all([
    repos.followUps.listUnresolvedMissed({ now, limit: 1000 }),
    repos.leads.listReturned(1000),
  ]);
  return { missed: missed.length, returned: returned.length };
}

export interface ReturnedLeadItem {
  lead: Lead;
  /** Clerk user id of the team member who returned it. */
  returnedBy: string | null;
  reason: string | null;
  returnedAt: Date;
  /** The optional note they wrote, if any (never present after an erasure). */
  note: string | null;
  lastContactAt: Date | null;
  contactAttempts: number;
  /** The most recent follow-up on the lead (usually the one closed by the return). */
  lastFollowUp: LeadFollowUp | null;
  requirement: string | null;
  developerName: string | null;
}

/** The Founder's Returned Leads queue: why each came back, without asking the employee. Founder only. */
export async function getReturnedLeads(repos: LeadRepositories, actor: LeadActor): Promise<ReturnedLeadItem[]> {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
  const leads = await repos.leads.listReturned(LIST_LIMIT);
  if (leads.length === 0) return [];
  const developerIds = [...new Set(leads.map((lead) => lead.developerId).filter((id): id is string => id !== null))];
  const [summaries, names] = await Promise.all([repos.events.summarise(leads.map((lead) => lead.id)), repos.leads.developerNames(developerIds)]);
  const summaryByLead = new Map(summaries.map((summary) => [summary.leadId, summary]));

  return Promise.all(
    leads.map(async (lead) => {
      const [events, followUps, requirement] = await Promise.all([
        repos.events.listByLead(lead.id),
        repos.followUps.listByLead(lead.id),
        repos.requirements.getActiveByLead(lead.id),
      ]);
      const returned = [...events].reverse().find((event) => event.eventType === "RETURNED_TO_FOUNDER");
      const note = returned && typeof returned.payload.note === "string" ? returned.payload.note : null;
      const summary = summaryByLead.get(lead.id) ?? null;
      return {
        lead,
        returnedBy: lead.returnedFrom,
        reason: lead.returnReason,
        returnedAt: lead.returnedAt!,
        note,
        lastContactAt: summary?.lastContactAt ?? null,
        contactAttempts: summary?.contactAttempts ?? 0,
        lastFollowUp: followUps[0] ?? null,
        requirement: requirement ? requirementOneLine(requirement) : null,
        developerName: (lead.developerId ? names[lead.developerId] : null) ?? summary?.firstDeveloperName ?? null,
      };
    }),
  );
}

export interface MyWorkItem {
  followUp: LeadFollowUp;
  lead: Lead;
}

export interface MyWorkState {
  /** Unresolved misses — these come first, and while any exist the rest of the workspace is closed. */
  missed: MissedFollowUpItem[];
  /** Follow-ups due within the next DUE_SOON_MINUTES (calls due now). */
  dueNow: MyWorkItem[];
  /** The rest of today's follow-ups. */
  dueToday: MyWorkItem[];
  /** True while there is any unresolved miss. */
  blocked: boolean;
}

/**
 * "What do I need to do now?" for a team member, in priority order: missed follow-ups, calls due now, the rest of
 * today. Loading it records misses and sends any "due soon" notifications (once each).
 */
export async function getMyWorkState(repos: LeadRepositories, actor: LeadActor, now: Date = new Date(), notifier?: LeadNotifier): Promise<MyWorkState> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const ownerId = actor.actorId;
  await sweepMissedFollowUps(repos, { ownerId }, now, notifier);
  await notifyDueFollowUps(repos, { ownerId }, now, notifier);

  const dueSoonEnd = new Date(now.getTime() + DUE_SOON_MINUTES * 60_000);
  const [missedRows, dueNow, dueToday] = await Promise.all([
    repos.followUps.listUnresolvedMissed({ ownerId, now, limit: LIST_LIMIT }),
    repos.followUps.listScheduled({ ownerId, from: now, to: dueSoonEnd, limit: 50 }),
    repos.followUps.listScheduled({ ownerId, from: dueSoonEnd, to: endOfDayIn(now), limit: 50 }),
  ]);
  const missed = await toMissedItems(repos, missedRows, now);
  return { missed, dueNow, dueToday, blocked: missed.length > 0 };
}

/** Thrown-for-clarity helper used by screens that need the block reason. */
export function blockMessage(error: unknown): { missedCount: number } | null {
  return error instanceof MissedFollowUpBlockError ? { missedCount: error.missedCount } : null;
}

export function parseMissedFilters(input: { ownerId?: string; temperature?: string; status?: string; days?: string; minHours?: string }, now: Date): MissedFilters {
  const filters: MissedFilters = {};
  if (input.ownerId) filters.ownerId = input.ownerId;
  if (input.temperature === "HOT" || input.temperature === "WARM" || input.temperature === "COLD") filters.temperature = input.temperature;
  if (input.status && (LEAD_STATUSES as readonly string[]).includes(input.status)) filters.status = input.status as LeadStatus;
  const days = Number(input.days);
  if (Number.isInteger(days) && days > 0 && days <= 365) filters.from = new Date(now.getTime() - days * 86_400_000);
  const hours = Number(input.minHours);
  if (Number.isFinite(hours) && hours > 0 && hours <= 24 * 365) filters.minOverdueMs = hours * 3_600_000;
  return filters;
}
