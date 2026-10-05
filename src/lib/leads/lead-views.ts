import { FOUNDER_TIME_ZONE, QUEUE_EXCLUDED_STATUSES } from "./queue-config.ts";
import type { Lead, LeadStatus } from "./types.ts";

/**
 * The founder's Leads list views and dashboard counts — defined ONCE, here,
 * as plain predicates. The in-memory repository uses these directly; the
 * PostgreSQL adapter expresses the same rules in SQL, and an integration test
 * asserts the two agree on the same data. Erased leads (anonymous skeletons)
 * are never listed or counted.
 */

export const LEAD_VIEWS = ["attention", "all", "new", "hot", "warm", "cold", "overdue", "due_today", "qualified"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

/** Statuses whose leads are finished or not real prospects: they never count as hot/warm/cold or as a follow-up that needs doing. */
export const CLOSED_OUT_STATUSES: readonly LeadStatus[] = [...QUEUE_EXCLUDED_STATUSES, "NOT_INTERESTED", "LOST"];

export interface LeadCounts {
  total: number;
  new: number;
  hot: number;
  warm: number;
  cold: number;
  overdue: number;
  dueToday: number;
  qualified: number;
  siteVisitScheduled: number;
  booked: number;
}

export interface LeadListQuery {
  /** "attention" is served by the Today queue, not by this list; the repository treats it as "all". */
  view: Exclude<LeadView, "attention">;
  limit: number;
  offset: number;
  now: Date;
  /** The instant the founder's current day ends (see endOfDayIn). */
  endOfToday: Date;
}

const open = (lead: Lead) => !CLOSED_OUT_STATUSES.includes(lead.status);

export function matchesView(lead: Lead, view: LeadListQuery["view"], now: Date, endOfToday: Date): boolean {
  if (lead.erasedAt) return false;
  const due = lead.nextFollowUpAt;
  switch (view) {
    case "all":
      return true;
    case "new":
      return lead.status === "NEW";
    case "hot":
      return lead.temperature === "HOT" && open(lead);
    case "warm":
      return lead.temperature === "WARM" && open(lead);
    case "cold":
      return lead.temperature === "COLD" && open(lead);
    case "overdue":
      return due !== null && due.getTime() < now.getTime() && open(lead);
    case "due_today":
      return due !== null && due.getTime() >= now.getTime() && due.getTime() < endOfToday.getTime() && open(lead);
    case "qualified":
      return lead.status === "QUALIFIED";
  }
}

export function countLeads(leads: Lead[], now: Date, endOfToday: Date): LeadCounts {
  const live = leads.filter((lead) => !lead.erasedAt);
  const n = (view: LeadListQuery["view"]) => live.filter((lead) => matchesView(lead, view, now, endOfToday)).length;
  return {
    total: live.length,
    new: n("new"),
    hot: n("hot"),
    warm: n("warm"),
    cold: n("cold"),
    overdue: n("overdue"),
    dueToday: n("due_today"),
    qualified: n("qualified"),
    siteVisitScheduled: live.filter((lead) => lead.status === "SITE_VISIT_SCHEDULED").length,
    booked: live.filter((lead) => lead.status === "BOOKED").length,
  };
}

/** Sort order for a list view: follow-up views by what is due first, everything else by latest activity; lead id last so pages are stable. */
export function compareForView(view: LeadListQuery["view"]): (a: Lead, b: Lead) => number {
  const byActivity = (a: Lead, b: Lead) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime() || a.id.localeCompare(b.id);
  if (view === "overdue" || view === "due_today") {
    return (a, b) => (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
  }
  return byActivity;
}

/** The offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant the calendar day containing `now` ends (start of the next day) in `timeZone`. */
export function endOfDayIn(now: Date, timeZone: string = FOUNDER_TIME_ZONE): Date {
  const offset = zoneOffsetMs(timeZone, now);
  const local = new Date(now.getTime() + offset);
  const nextLocalMidnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return new Date(nextLocalMidnightAsUtc - offset);
}

export type FollowUpState = "OVERDUE" | "TODAY" | "UPCOMING";

export function followUpState(dueAt: Date | null, now: Date, endOfToday: Date): FollowUpState | null {
  if (dueAt === null) return null;
  if (dueAt.getTime() < now.getTime()) return "OVERDUE";
  return dueAt.getTime() < endOfToday.getTime() ? "TODAY" : "UPCOMING";
}
