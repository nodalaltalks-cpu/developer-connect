import { CURRENCIES, type FinanceGroup } from "./finance.ts";
import type { LeadCurrency } from "./types.ts";

/**
 * THE FOUNDER'S ATTENTION RULES - pure, deterministic, documented. Turns counts the database already holds into a short,
 * prioritised list of "what needs a decision", each with the reason (with the numbers), what to do next and where to do it.
 * No scoring, no model, no hidden weights: every threshold is a named constant below and every item says which rule fired.
 *
 * Silence is information too: a rule with nothing to report adds nothing, so a quiet business shows a short list.
 */

export const THRESHOLDS = {
  /** A lead nobody owns for longer than this is overdue for assignment. */
  UNASSIGNED_HOURS: 24,
  /** An owned open lead with no activity for this many days is stale. */
  STALE_DAYS: 7,
  /** Commission still unpaid this many days after booking needs chasing. */
  COMMISSION_CHASE_DAYS: 30,
  /** A channel needs at least this many leads before conversion or cost is judged (small numbers are noise). */
  MIN_LEADS_TO_JUDGE: 20,
  /** A channel's qualified rate is "low" when it is below this fraction of the overall rate. */
  LOW_CONVERSION_FRACTION: 0.5,
  /** A channel's cost per lead is "high" when it exceeds this multiple of the other channels' cost per lead in the same currency. */
  HIGH_CPL_MULTIPLE: 2,
} as const;

export type Severity = "HIGH" | "MEDIUM";

export interface AttentionItem {
  /** Which rule fired. */
  key: "NEW_LEADS" | "UNTOUCHED_HOT" | "VISITS_TODAY" | "PENDING_APPROVALS" | "MISSED_FOLLOW_UPS" | "PENDING_SITE_VISITS" | "UNASSIGNED_LEADS" | "STALE_LEADS" | "SPEND_NO_LEADS" | "LOW_CONVERSION" | "HIGH_CPL" | "OUTSTANDING_COMMISSION" | "RETURNED_LEADS";
  severity: Severity;
  title: string;
  /** Why, with the numbers. */
  detail: string;
  /** What to do next. */
  action: string;
  href: string;
}

export interface AttentionInput {
  /** Optional so older callers still compile; each is a plain count of real records. */
  /** Open leads still at NEW (nobody has recorded any progress). */
  newLeads?: number;
  /** HOT, open leads with no activity for 24 hours or more. */
  untouchedHot?: number;
  /** Open site visits scheduled for the rest of today. */
  visitsToday?: number;
  /** Team members the Founder has invited but not yet approved. */
  pendingApprovals?: number;
  missedFollowUps: number;
  returnedLeads: number;
  /** Open site visits whose scheduled time has passed with no outcome recorded. */
  visitsAwaitingOutcome: number;
  unassignedOpen: number;
  unassignedOld: number;
  staleOpen: number;
  channels: readonly FinanceGroup[];
  /** Total leads and qualified leads over the report range (for the overall rate). */
  totalLeads: number;
  totalQualified: number;
  /** Commission outstanding for bookings older than the chase window, per currency. */
  overdueCommission: Partial<Record<LeadCurrency, { amount: number; bookings: number }>>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const money = (n: number, c: LeadCurrency) => (c === "INR" ? `₹${new Intl.NumberFormat("en-IN").format(n)}` : `AED ${new Intl.NumberFormat("en-US").format(n)}`);

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  if ((input.untouchedHot ?? 0) > 0) {
    items.push({ key: "UNTOUCHED_HOT", severity: "HIGH", title: `${plural(input.untouchedHot!, "hot lead")} with no activity for a day`, detail: "Marked hot, still open, and nothing has happened for 24 hours or more.", action: "Call them, or ask the owner why not.", href: "/admin/leads?view=hot" });
  }
  if ((input.pendingApprovals ?? 0) > 0) {
    items.push({ key: "PENDING_APPROVALS", severity: "MEDIUM", title: `${plural(input.pendingApprovals!, "team member")} waiting for your approval`, detail: "Invited but not approved, so they cannot sign in yet.", action: "Review and approve or leave them out.", href: "/admin/staff" });
  }
  if ((input.visitsToday ?? 0) > 0) {
    items.push({ key: "VISITS_TODAY", severity: "MEDIUM", title: `${plural(input.visitsToday!, "site visit")} today`, detail: "Open visits scheduled for the rest of today.", action: "Make sure each one is confirmed and has someone attending.", href: "/admin/site-visits" });
  }
  if ((input.newLeads ?? 0) > 0) {
    items.push({ key: "NEW_LEADS", severity: "MEDIUM", title: `${plural(input.newLeads!, "new lead")} to pick up`, detail: "Leads still at New: no progress has been recorded on them.", action: "Assign them or make the first call.", href: "/admin/leads?view=new" });
  }

  if (input.missedFollowUps > 0) {
    items.push({ key: "MISSED_FOLLOW_UPS", severity: "HIGH", title: `${plural(input.missedFollowUps, "missed follow-up")}`, detail: "A follow-up time passed with nothing done. The employee is blocked from other leads until each is resolved.", action: "Open the missed leads and make sure each one is resolved.", href: "/admin/missed-leads" });
  }
  if (input.visitsAwaitingOutcome > 0) {
    items.push({ key: "PENDING_SITE_VISITS", severity: "HIGH", title: `${plural(input.visitsAwaitingOutcome, "site visit")} waiting for an outcome`, detail: "The visit time has passed but nobody has recorded whether it happened.", action: "Ask the owner to record completed or no-show.", href: "/admin/site-visits" });
  }
  if (input.unassignedOld > 0) {
    items.push({ key: "UNASSIGNED_LEADS", severity: "HIGH", title: `${plural(input.unassignedOld, "lead")} unassigned for over ${THRESHOLDS.UNASSIGNED_HOURS} hours`, detail: `${input.unassignedOpen} open ${input.unassignedOpen === 1 ? "lead has" : "leads have"} no owner; ${input.unassignedOld} ${input.unassignedOld === 1 ? "has" : "have"} waited longer than a day.`, action: "Assign them to a team member.", href: "/admin/leads" });
  } else if (input.unassignedOpen > 0) {
    items.push({ key: "UNASSIGNED_LEADS", severity: "MEDIUM", title: `${plural(input.unassignedOpen, "unassigned lead")}`, detail: "Open leads with no owner yet (all newer than a day).", action: "Assign them before they go cold.", href: "/admin/leads" });
  }
  if (input.returnedLeads > 0) {
    items.push({ key: "RETURNED_LEADS", severity: "MEDIUM", title: `${plural(input.returnedLeads, "returned lead")} waiting for you`, detail: "Team members handed these back and they are in your queue.", action: "Reassign or close each one.", href: "/admin/returned-leads" });
  }
  if (input.staleOpen > 0) {
    items.push({ key: "STALE_LEADS", severity: "MEDIUM", title: `${plural(input.staleOpen, "stale lead")}`, detail: `Owned, still open, and no activity for ${THRESHOLDS.STALE_DAYS} days or more.`, action: "Look at who owns them and whether to reassign or close.", href: "/admin/leads" });
  }

  const overallRate = input.totalLeads > 0 ? input.totalQualified / input.totalLeads : null;
  for (const c of input.channels) {
    const leads = c.counts.leads;
    for (const currency of CURRENCIES) {
      const m = c.money[currency];
      if (m && m.spend > 0 && leads === 0) {
        items.push({ key: "SPEND_NO_LEADS", severity: "HIGH", title: `${c.label}: ${money(m.spend, currency)} spent, no leads`, detail: "Money was recorded against this channel in the range and not one lead came from it.", action: "Check the tracking links, or pause the spend.", href: "/admin/finance" });
      }
    }
    if (leads >= THRESHOLDS.MIN_LEADS_TO_JUDGE && overallRate !== null && overallRate > 0) {
      const rate = c.counts.qualified / leads;
      if (rate < overallRate * THRESHOLDS.LOW_CONVERSION_FRACTION) {
        items.push({ key: "LOW_CONVERSION", severity: "MEDIUM", title: `${c.label}: low conversion`, detail: `${pct(rate)} of its ${leads} leads qualified, against ${pct(overallRate)} overall.`, action: "Review lead quality from this channel before spending more on it.", href: "/admin/acquisition" });
      }
    }
  }
  for (const currency of CURRENCIES) {
    const withSpend = input.channels.filter((c) => (c.money[currency]?.spend ?? 0) > 0 && c.counts.leads > 0);
    for (const c of withSpend) {
      // Compared with the OTHER channels that have spend in the same currency, so one expensive channel cannot hide itself in the average.
      const others = withSpend.filter((o) => o !== c);
      const otherLeads = others.reduce((n, o) => n + o.counts.leads, 0);
      if (others.length === 0 || otherLeads === 0) continue;
      const average = others.reduce((n, o) => n + o.money[currency]!.spend, 0) / otherLeads;
      const cpl = c.money[currency]!.cpl;
      if (c.counts.leads >= THRESHOLDS.MIN_LEADS_TO_JUDGE / 2 && cpl !== null && cpl > average * THRESHOLDS.HIGH_CPL_MULTIPLE) {
        items.push({ key: "HIGH_CPL", severity: "MEDIUM", title: `${c.label}: high cost per lead`, detail: `${money(Math.round(cpl), currency)} per lead against ${money(Math.round(average), currency)} across your other ${currency} channels.`, action: "Check targeting and creative, or shift budget.", href: "/admin/finance" });
      }
    }
  }
  for (const currency of CURRENCIES) {
    const o = input.overdueCommission[currency];
    if (o && o.amount > 0) {
      items.push({ key: "OUTSTANDING_COMMISSION", severity: "MEDIUM", title: `${money(o.amount, currency)} commission unpaid over ${THRESHOLDS.COMMISSION_CHASE_DAYS} days`, detail: `${plural(o.bookings, "booking")} past the chase window.`, action: "Chase the developer for payment.", href: "/admin/finance" });
    }
  }

  const rank = { HIGH: 0, MEDIUM: 1 } as const;
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
