import type { LeadCurrency, LeadStatus } from "./types.ts";

/**
 * Tunable constants for the Founder's Today queue. They are plain numbers on
 * purpose: Phase 1 prioritises with transparent rules, not a score, and the
 * founder can adjust a threshold by editing one line here.
 */

/** A budget at or above this (the upper figure the buyer gave) counts as "high value" in its own currency. */
export const HIGH_BUDGET_MIN: Record<LeadCurrency, number> = {
  INR: 20_000_000, // ₹2 Cr
  AED: 900_000,
};

/** A lead we've not contacted for this long needs attention again (high-value and strong-timeline buckets). */
export const STALE_CONTACT_HOURS = 48;

/** Buyer activity newer than this counts as "recent". */
export const RECENT_ACTIVITY_HOURS = 24;

/** How many entries the queue returns by default. */
export const DEFAULT_QUEUE_LIMIT = 50;

/** Statuses that are finished or not a real prospect — never on the queue, even if the buyer returns. */
export const QUEUE_EXCLUDED_STATUSES: readonly LeadStatus[] = ["BOOKED", "CLOSED", "WRONG_NUMBER", "DUPLICATE", "UNQUALIFIED"];

/** Statuses the founder has parked: they appear only when a follow-up is due or the buyer comes back. */
export const QUEUE_DORMANT_STATUSES: readonly LeadStatus[] = ["NOT_INTERESTED", "LOST", "REVISIT_LATER"];

/** "Today" for follow-ups means the founder's calendar day in this time zone (both target markets, India and the UAE, have no daylight saving). */
export const FOUNDER_TIME_ZONE = "Asia/Kolkata";

/** Leads per page in the founder's Leads list. */
export const LEADS_PAGE_SIZE = 25;
