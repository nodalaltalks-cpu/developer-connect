import type { StaffMember } from "../staff/types.ts";

/**
 * THE AUTOMATION RULES - pure and deterministic. Every automation is a plain rule over data the system already holds;
 * there is no model, no randomness and no hidden weight. Each rule has a name, a default, a window and a cap, all
 * stated here, and every action it causes is recorded (automation_actions) with the rule that caused it.
 *
 *  - Reminders are ON by default: they only tell a team member about their own work and cannot change a lead.
 *  - AUTO_ROUTING is OFF by default: it changes who owns a lead, so the Founder turns it on deliberately.
 *  - Nothing here sends WhatsApp, SMS or email. Those need a provider, credentials and consent infrastructure that do
 *    not exist yet; in-app notifications are the only channel.
 */

export const AUTOMATION_RULES = ["FOLLOW_UP_REMINDERS", "SITE_VISIT_REMINDERS", "STALE_LEAD_ALERTS", "RETURN_VISIT_ALERTS", "AUTO_ROUTING"] as const;
export type AutomationRule = (typeof AUTOMATION_RULES)[number];

export const AUTOMATION_DEFAULTS: Record<AutomationRule, boolean> = {
  FOLLOW_UP_REMINDERS: true,
  SITE_VISIT_REMINDERS: true,
  STALE_LEAD_ALERTS: true,
  RETURN_VISIT_ALERTS: true,
  AUTO_ROUTING: false,
};

export const AUTOMATION_LABELS: Record<AutomationRule, { title: string; description: string }> = {
  FOLLOW_UP_REMINDERS: { title: "Follow-up reminders", description: "Notifies a team member shortly before a follow-up is due, and when one is missed. Once per scheduled time." },
  SITE_VISIT_REMINDERS: { title: "Site visit reminders", description: "Notifies the lead's owner about 24 hours and again about 2 hours before an open site visit. Once per visit time and window." },
  STALE_LEAD_ALERTS: { title: "Stale lead alerts", description: "Tells an owner when an open lead of theirs has had no activity for 7 days. Once per quiet spell." },
  RETURN_VISIT_ALERTS: { title: "Return visit alerts", description: "Tells an owner when a buyer they are working with comes back to the site (at least 2 hours after enquiring) - the best moment to call. Counted only from visitors who allowed analytics. At most one alert per lead every 12 hours." },
  AUTO_ROUTING: { title: "Automatic routing (off by default)", description: "Assigns unassigned new leads to the active team member with the fewest open leads. Changes who owns a lead, so it stays off until you turn it on." },
};

export const WINDOWS = {
  /** Site visit reminder windows, in milliseconds before the visit. The narrowest window that applies is used. */
  VISIT_FAR_MS: 24 * 3_600_000,
  VISIT_NEAR_MS: 2 * 3_600_000,
  /** A lead is stale after this long with no activity. */
  STALE_MS: 7 * 24 * 3_600_000,
  /** A return visit is looked for this far back, so a late or missed run still catches it (the dedupe key stops repeats). */
  RETURN_LOOKBACK_MS: 24 * 3_600_000,
  /** A page view this soon after the enquiry is the enquiry session itself, not a return. */
  RETURN_MIN_AGE_MS: 2 * 3_600_000,
  /** At most one return alert per lead per bucket of this length. */
  RETURN_BUCKET_MS: 12 * 3_600_000,
  /** A new unassigned lead waits this long before auto-routing may take it (the Founder gets a moment to assign it personally). */
  ROUTING_MIN_AGE_MS: 10 * 60_000,
} as const;

export const CAPS = {
  /** Most reminders of each kind in one run, so one bad moment cannot flood anyone. */
  PER_RUN: 100,
  /** Most leads auto-routed in one run. */
  ROUTING_PER_RUN: 20,
  /** A failed action is retried on later runs up to this many attempts in total. */
  MAX_ATTEMPTS: 3,
  /** A claim with no result after this long is treated as abandoned (the run crashed) and may be retried. */
  CLAIM_STALE_MS: 10 * 60_000,
} as const;

export type VisitWindow = "24h" | "2h";

/** Which reminder window a visit falls in right now, or null when it is not within a reminder window. */
export function visitWindow(scheduledAt: Date, now: Date): VisitWindow | null {
  const until = scheduledAt.getTime() - now.getTime();
  if (until <= 0 || until > WINDOWS.VISIT_FAR_MS) return null;
  return until <= WINDOWS.VISIT_NEAR_MS ? "2h" : "24h";
}

export const visitReminderKey = (visitId: string, scheduledAt: Date, window: VisitWindow) => `svr:${visitId}:${scheduledAt.toISOString()}:${window}`;
export const staleLeadKey = (leadId: string, lastActivityAt: Date) => `stale:${leadId}:${lastActivityAt.toISOString()}`;
export const returnVisitKey = (leadId: string, viewedAt: Date) => `ret:${leadId}:${Math.floor(viewedAt.getTime() / WINDOWS.RETURN_BUCKET_MS)}`;
export const routingKey = (leadId: string) => `route:${leadId}`;

export interface RoutingChoice {
  member: StaffMember;
  /** Open leads they held when chosen (for the explanation). */
  openLeads: number;
}

/**
 * Least-loaded active employee. Ties break on name then user id so the choice is always the same for the same data.
 * Returns null when there is nobody active to route to.
 */
export function chooseAssignee(staff: readonly StaffMember[], openByOwner: Readonly<Record<string, number>>): RoutingChoice | null {
  const candidates = staff.filter((m) => m.active && m.role === "EMPLOYEE");
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => (openByOwner[a.userId] ?? 0) - (openByOwner[b.userId] ?? 0) || a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId));
  return { member: ranked[0], openLeads: openByOwner[ranked[0].userId] ?? 0 };
}

export function resolveSettings(stored: Readonly<Record<string, boolean>>): Record<AutomationRule, boolean> {
  return Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule, stored[rule] ?? AUTOMATION_DEFAULTS[rule]])) as Record<AutomationRule, boolean>;
}
