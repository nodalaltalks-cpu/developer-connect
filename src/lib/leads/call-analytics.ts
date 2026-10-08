import { UnauthorizedLeadActionError, LeadValidationError } from "./errors.ts";
import { BUSINESS_TIME_ZONE, businessLocalToInstant } from "./format.ts";
import { endOfDayIn } from "./lead-views.ts";
import type { CallAggregateQuery, CallAggregateRow, CallGroupBy, CallWithLead, LeadRepositories } from "./repository.ts";
import type { StaffRepository } from "../staff/repository.ts";
import { CALL_DISPOSITIONS, CALL_STATUSES, LEAD_SOURCE_TYPES, type CallDisposition, type CallStatus, type LeadActor, type LeadSourceType } from "./types.ts";

/**
 * Call analytics, DERIVED from the call records and the raw provider events — nothing here is typed in or edited by
 * anyone, and nothing is stored separately (no analytics database). One aggregation (CallRepository.aggregate) serves
 * every view: the hour of day, each day/week/month/quarter/year, and per employee are the same query with a different
 * bucket, so the reporting periods are never duplicated logic.
 *
 * Counting rules, stated once: a "dialed" call is a call record (placed through the internal dialer); a "connected"
 * call is one the provider reported answered; talk time is the provider-reported duration of connected calls. A button
 * click, a page visit or a manual log is never a call here.
 *
 * Deliberately NO score, rank or "productivity index": activity (dialed), connection, conversation (talk time) and
 * outcomes (qualified, site visits, bookings, revenue) are shown side by side so the Founder can see the difference
 * between busy and effective.
 */

export const RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PERIODS = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
export type Period = (typeof PERIODS)[number];

const PERIOD_GROUP: Record<Period, Exclude<CallGroupBy, "HOUR_OF_DAY" | "HOUR" | "EMPLOYEE">> = { daily: "DAY", weekly: "WEEK", monthly: "MONTH", quarterly: "QUARTER", yearly: "YEAR" };
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

export interface DateRange {
  from: Date;
  /** Exclusive. */
  to: Date;
  label: string;
}

/** Midnight at the start of the business day containing `now` (India has no daylight saving). */
export function startOfDayIn(now: Date, timeZone: string = BUSINESS_TIME_ZONE): Date {
  return new Date(endOfDayIn(now, timeZone).getTime() - DAY_MS);
}

/** Turns a preset (or a custom pair of YYYY-MM-DD dates, inclusive) into an exact instant range in the business zone. */
export function resolveRange(preset: RangePreset, now: Date, custom?: { from?: string; to?: string }, timeZone: string = BUSINESS_TIME_ZONE): DateRange {
  const start = startOfDayIn(now, timeZone);
  const end = endOfDayIn(now, timeZone);
  switch (preset) {
    case "today":
      return { from: start, to: end, label: "Today" };
    case "yesterday":
      return { from: new Date(start.getTime() - DAY_MS), to: start, label: "Yesterday" };
    case "last7":
      return { from: new Date(start.getTime() - 6 * DAY_MS), to: end, label: "Last 7 days" };
    case "last30":
      return { from: new Date(start.getTime() - 29 * DAY_MS), to: end, label: "Last 30 days" };
    case "custom": {
      const from = businessLocalToInstant(`${custom?.from ?? ""}T00:00`, timeZone);
      const lastDay = businessLocalToInstant(`${custom?.to ?? ""}T00:00`, timeZone);
      if (!from || !lastDay) throw new LeadValidationError("range", "Choose a valid start and end date.");
      const to = new Date(lastDay.getTime() + DAY_MS);
      if (to.getTime() <= from.getTime()) throw new LeadValidationError("range", "The end date cannot be before the start date.");
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) throw new LeadValidationError("range", "Choose a range of a year or less.");
      return { from, to, label: `${custom!.from} to ${custom!.to}` };
    }
  }
}

export interface CallMetrics {
  dialed: number;
  connected: number;
  /** connected / dialed, or null when nothing was dialed (never a made-up 0%). */
  connectionRate: number | null;
  noAnswer: number;
  busy: number;
  failed: number;
  rejected: number;
  talkSeconds: number;
  /** Average talk time of connected calls, or null when none connected. */
  avgConnectedSeconds: number | null;
  leadsCalled: number;
}

export function toMetrics(row?: CallAggregateRow | null): CallMetrics {
  const r = row ?? { key: "", dialed: 0, connected: 0, noAnswer: 0, busy: 0, failed: 0, rejected: 0, talkSeconds: 0, leadsCalled: 0 };
  return {
    dialed: r.dialed,
    connected: r.connected,
    connectionRate: r.dialed > 0 ? r.connected / r.dialed : null,
    noAnswer: r.noAnswer,
    busy: r.busy,
    failed: r.failed,
    rejected: r.rejected,
    talkSeconds: r.talkSeconds,
    avgConnectedSeconds: r.connected > 0 ? Math.round(r.talkSeconds / r.connected) : null,
    leadsCalled: r.leadsCalled,
  };
}

/** "03:42" — one call's duration. */
export function formatCallDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "2h 14m" / "3m 05s" — total talk time over a period. */
export function formatTalkTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** "68%" or "—". */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

// --- filters --------------------------------------------------------------------------------------

export interface InsightFilters {
  range: DateRange;
  period: Period;
  /** A team member's (or the Founder's) Clerk id. */
  employeeId?: string;
  sourceType?: LeadSourceType;
  statuses?: CallStatus[];
  connected?: boolean;
  disposition?: CallDisposition;
}

export function parseInsightFilters(
  input: { range?: string; from?: string; to?: string; period?: string; employee?: string; source?: string; status?: string; connected?: string; disposition?: string },
  now: Date,
): InsightFilters {
  const preset = (RANGE_PRESETS as readonly string[]).includes(input.range ?? "") ? (input.range as RangePreset) : "today";
  let range: DateRange;
  try {
    range = resolveRange(preset, now, { from: input.from, to: input.to });
  } catch {
    range = resolveRange("today", now);
  }
  const filters: InsightFilters = { range, period: (PERIODS as readonly string[]).includes(input.period ?? "") ? (input.period as Period) : "daily" };
  if (input.employee) filters.employeeId = input.employee;
  if ((LEAD_SOURCE_TYPES as readonly string[]).includes(input.source ?? "")) filters.sourceType = input.source as LeadSourceType;
  if ((CALL_STATUSES as readonly string[]).includes(input.status ?? "")) filters.statuses = [input.status as CallStatus];
  if (input.connected === "yes") filters.connected = true;
  if (input.connected === "no") filters.connected = false;
  if ((CALL_DISPOSITIONS as readonly string[]).includes(input.disposition ?? "")) filters.disposition = input.disposition as CallDisposition;
  return filters;
}

function aggregateQuery(filters: InsightFilters, groupBy: CallGroupBy): CallAggregateQuery {
  return {
    from: filters.range.from,
    to: filters.range.to,
    groupBy,
    timeZone: BUSINESS_TIME_ZONE,
    staffUserId: filters.employeeId,
    sourceType: filters.sourceType,
    statuses: filters.statuses,
    connected: filters.connected,
    disposition: filters.disposition,
  };
}

function assertFounder(actor: LeadActor): void {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
}

// --- the employee's own dashboard -----------------------------------------------------------------

export interface MyCallDashboard {
  /** The range the figures cover (Today by default; Yesterday, 7 days, 30 days or custom). */
  range: DateRange;
  metrics: CallMetrics;
  followUps: { created: number; completed: number; missed: number };
  recent: CallWithLead[];
}

/** "My calls — today": the signed-in member's own real call records. Scope is the actor's id, never an argument. */
export async function getMyCallDashboard(
  repos: LeadRepositories,
  actor: LeadActor,
  now: Date = new Date(),
  rangeInput: { range?: string; from?: string; to?: string } = {},
): Promise<MyCallDashboard> {
  if (!actor.actorId || (actor.actorType !== "EMPLOYEE" && actor.actorType !== "FOUNDER")) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  // Only the date range comes from the caller; whose calls they are is always the actor's own id.
  const range = parseInsightFilters({ range: rangeInput.range ?? "today", from: rangeInput.from, to: rangeInput.to }, now).range;
  const [rows, stats, recent] = await Promise.all([
    repos.calls.aggregate({ from: range.from, to: range.to, groupBy: "EMPLOYEE", timeZone: BUSINESS_TIME_ZONE, staffUserId: actor.actorId }),
    repos.followUps.statsByStaff(range.from, range.to, now),
    repos.calls.listRecent({ staffUserId: actor.actorId, from: range.from, to: range.to, limit: 200 }),
  ]);
  const mine = stats[actor.actorId] ?? { created: 0, completed: 0, missedNow: 0 };
  return { range, metrics: toMetrics(rows[0]), followUps: { created: mine.created, completed: mine.completed, missed: mine.missedNow }, recent };
}

// --- Founder: employee insights -------------------------------------------------------------------

export interface EmployeeInsightRow {
  userId: string;
  name: string;
  active: boolean;
  calls: CallMetrics;
  followUps: { created: number; completed: number; missedNow: number };
  leadsReturned: number;
  /** Where this person's CURRENT leads stand: a snapshot, not credit for how they got there. */
  currentLeads: { qualified: number; siteVisit: number; booked: number };
  /** Booking value on their current leads, per currency (never summed across currencies). */
  revenue: Array<{ currency: string; total: number; count: number }>;
  /**
   * What this person DID in the selected range, with the denominators needed to read it fairly. A ratio is null when its
   * denominator is zero (never a made-up 0%), and nothing here is a score or a rank.
   */
  contribution: {
    /** Live leads they own today (the denominator for "how much was there to work"). */
    ownedLeads: number;
    requirementsCreated: number;
    projectsShortlisted: number;
    siteVisitsScheduled: number;
    siteVisitsCompleted: number;
    siteVisitsNoShow: number;
    /** Distinct leads they reached by phone (more than 10 seconds) / leads they own. */
    leadsReachedShare: number | null;
    /** Site visits scheduled per connected call. */
    visitsPerConnectedCall: number | null;
    /** Completed / (completed + no-show): of the visits whose outcome is known, how many happened. */
    visitCompletionRate: number | null;
  };
}

function contributionOf(ownedLeads: number, requirementsCreated: number, projectsShortlisted: number, visits: { scheduled: number; completed: number; noShow: number }, calls: CallMetrics): EmployeeInsightRow["contribution"] {
  const known = visits.completed + visits.noShow;
  return {
    ownedLeads,
    requirementsCreated,
    projectsShortlisted,
    siteVisitsScheduled: visits.scheduled,
    siteVisitsCompleted: visits.completed,
    siteVisitsNoShow: visits.noShow,
    leadsReachedShare: ownedLeads > 0 ? Math.min(1, calls.leadsCalled / ownedLeads) : null,
    visitsPerConnectedCall: calls.connected > 0 ? visits.scheduled / calls.connected : null,
    visitCompletionRate: known > 0 ? visits.completed / known : null,
  };
}

export interface HourlyBucket {
  hour: number;
  dialed: number;
  connected: number;
  talkSeconds: number;
}

export interface PeriodBucket extends CallMetrics {
  key: string;
}

export interface EmployeeInsights {
  filters: InsightFilters;
  rows: EmployeeInsightRow[];
  /** Calls by hour of day (0–23, business time zone), both dialed and connected, for the selected filters. */
  hourly: HourlyBucket[];
  /** The same calls grouped by the chosen period. */
  periods: PeriodBucket[];
  totals: Pick<CallMetrics, "dialed" | "connected" | "connectionRate" | "talkSeconds" | "avgConnectedSeconds">;
}

/** The Founder's view of real sales activity, per employee, by hour and by period. Founder only. */
export async function getEmployeeInsights(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, filters: InsightFilters, now: Date = new Date()): Promise<EmployeeInsights> {
  assertFounder(actor);
  const [members, perEmployee, hourlyRows, periodRows, followUps, returned, owned, revenue, visitStats, requirementsMade, shortlisted, ownedCounts] = await Promise.all([
    staff.list(),
    repos.calls.aggregate(aggregateQuery({ ...filters, employeeId: undefined }, "EMPLOYEE")),
    repos.calls.aggregate(aggregateQuery(filters, "HOUR_OF_DAY")),
    repos.calls.aggregate(aggregateQuery(filters, PERIOD_GROUP[filters.period])),
    repos.followUps.statsByStaff(filters.range.from, filters.range.to, now),
    repos.events.countByTypeAndActor("RETURNED_TO_FOUNDER", filters.range.from, filters.range.to),
    repos.leads.ownerSummary(),
    repos.bookings.revenueByOwner(),
    repos.siteVisits.statsByStaff(filters.range.from, filters.range.to),
    repos.events.countByTypeAndActor("REQUIREMENT_CREATED", filters.range.from, filters.range.to),
    repos.events.countByTypeAndActor("PROJECT_SHORTLISTED", filters.range.from, filters.range.to),
    repos.leads.countByOwner(),
  ]);

  const names = new Map(members.map((m) => [m.userId, { name: m.displayName, active: m.active }]));
  const callRows = new Map(perEmployee.map((r) => [r.key, r]));
  // Every team member appears (even with no calls today — that is information); anyone else who called (the Founder) too.
  const ids = [...new Set([...members.map((m) => m.userId), ...perEmployee.map((r) => r.key)])];
  let rows: EmployeeInsightRow[] = ids.map((userId) => ({
    userId,
    name: names.get(userId)?.name ?? (userId === actor.actorId ? "Founder" : "Founder or former member"),
    active: names.get(userId)?.active ?? true,
    calls: toMetrics(callRows.get(userId)),
    followUps: followUps[userId] ?? { created: 0, completed: 0, missedNow: 0 },
    leadsReturned: returned[userId] ?? 0,
    currentLeads: owned[userId] ?? { qualified: 0, siteVisit: 0, booked: 0 },
    revenue: revenue.filter((r) => r.ownerId === userId).map(({ currency, total, count }) => ({ currency, total, count })),
    contribution: contributionOf(ownedCounts[userId] ?? 0, requirementsMade[userId] ?? 0, shortlisted[userId] ?? 0, visitStats[userId] ?? { scheduled: 0, completed: 0, noShow: 0 }, toMetrics(callRows.get(userId))),
  }));
  if (filters.employeeId) rows = rows.filter((row) => row.userId === filters.employeeId);
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const byHour = new Map(hourlyRows.map((r) => [r.key, r]));
  const hourly: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(String(hour).padStart(2, "0"));
    return { hour, dialed: row?.dialed ?? 0, connected: row?.connected ?? 0, talkSeconds: row?.talkSeconds ?? 0 };
  });
  const periods: PeriodBucket[] = periodRows.map((r) => ({ key: r.key, ...toMetrics(r) }));
  const total = toMetrics(hourlyRows.reduce<CallAggregateRow>((acc, r) => ({ ...acc, dialed: acc.dialed + r.dialed, connected: acc.connected + r.connected, talkSeconds: acc.talkSeconds + r.talkSeconds }), { key: "", dialed: 0, connected: 0, noAnswer: 0, busy: 0, failed: 0, rejected: 0, talkSeconds: 0, leadsCalled: 0 }));
  return { filters, rows, hourly, periods, totals: { dialed: total.dialed, connected: total.connected, connectionRate: total.connectionRate, talkSeconds: total.talkSeconds, avgConnectedSeconds: total.avgConnectedSeconds } };
}

/** The Founder's live feed of real call activity, newest first. Founder only. */
export async function getCallActivity(repos: LeadRepositories, actor: LeadActor, filters: Pick<InsightFilters, "range" | "employeeId" | "sourceType" | "statuses" | "connected" | "disposition">, limit = 50): Promise<CallWithLead[]> {
  assertFounder(actor);
  return repos.calls.listRecent({ from: filters.range.from, to: filters.range.to, staffUserId: filters.employeeId, sourceType: filters.sourceType, statuses: filters.statuses, connected: filters.connected, disposition: filters.disposition, limit });
}

// --- Call history filters (the same rules for the employee's own list and the Founder's) ---------

export const CALL_OUTCOME_FILTERS = ["all", "connected", "dialed", "not_connected", "callback"] as const;
export type CallOutcomeFilter = (typeof CALL_OUTCOME_FILTERS)[number];

export const CALL_OUTCOME_LABEL: Record<CallOutcomeFilter, string> = { all: "All calls", connected: "Connected", dialed: "Dialed", not_connected: "Not connected", callback: "Callback" };

export function parseCallOutcomeFilter(value: string | string[] | undefined): CallOutcomeFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (CALL_OUTCOME_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as CallOutcomeFilter) : "all";
}

/**
 * Pure and exact. CONNECTED is the server's >10 s classification; DIALED is a finished call of 10 s or less; NOT CONNECTED is a call
 * the network or the buyer ended without an answer (no answer, busy, rejected, failed, switched off, invalid number); CALLBACK is
 * a call whose outcome asked for one. A call can be both Dialed and Not connected: the filters are views, not a partition.
 */
export function matchesCallFilter(item: CallWithLead, filter: CallOutcomeFilter, source?: LeadSourceType): boolean {
  if (source && item.lead.sourceType !== source) return false;
  const { call } = item;
  switch (filter) {
    case "all":
      return true;
    case "connected":
      return call.classification === "CONNECTED";
    case "dialed":
      return call.classification === "DIALED";
    case "not_connected":
      return ["NO_ANSWER", "BUSY", "REJECTED", "FAILED"].includes(call.status) || ["NO_ANSWER", "BUSY", "SWITCHED_OFF", "INVALID_NUMBER"].includes(call.disposition ?? "");
    case "callback":
      return call.disposition === "CALLBACK_REQUESTED" || call.disposition === "FOLLOW_UP_REQUIRED";
  }
}
