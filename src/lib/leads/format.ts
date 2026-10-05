import type { LeadCurrency, LeadTimeline } from "./types.ts";

/** Human-readable formatting for the Today queue's reasons and the founder UI. Pure functions. */

function trim(value: number): string {
  // 2 -> "2", 1.5 -> "1.5", 1.25 -> "1.25"
  return String(Math.round(value * 100) / 100);
}

/** 20000000 INR -> "₹2 Cr"; 1500000 INR -> "₹15 L"; 1500000 AED -> "AED 1.5M"; 900000 AED -> "AED 900K". */
export function formatMoney(amount: number, currency: LeadCurrency): string {
  if (currency === "INR") {
    if (amount >= 10_000_000) return `₹${trim(amount / 10_000_000)} Cr`;
    if (amount >= 100_000) return `₹${trim(amount / 100_000)} L`;
    return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
  }
  if (amount >= 1_000_000) return `AED ${trim(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `AED ${trim(amount / 1_000)}K`;
  return `AED ${amount}`;
}

/** "₹2 Cr budget", "₹2 Cr+ budget" (minimum only) or "₹1.5 Cr–₹2 Cr budget"; null when no budget is known. */
export function formatBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  currency: LeadCurrency | null,
): string | null {
  if (!currency) return null;
  if (budgetMin !== null && budgetMax !== null && budgetMin !== budgetMax) {
    return `${formatMoney(budgetMin, currency)}–${formatMoney(budgetMax, currency)} budget`;
  }
  if (budgetMax !== null) return `${formatMoney(budgetMax, currency)} budget`;
  if (budgetMin !== null) return `${formatMoney(budgetMin, currency)}+ budget`;
  return null;
}

const TIMELINE_PHRASE: Record<LeadTimeline, string> = {
  WITHIN_30_DAYS: "wants to buy within 30 days",
  ONE_TO_THREE_MONTHS: "wants to buy in 1–3 months",
  THREE_TO_SIX_MONTHS: "wants to buy in 3–6 months",
  SIX_MONTHS_PLUS: "wants to buy in 6+ months",
  JUST_EXPLORING: "just exploring",
};

export function formatTimeline(timeline: LeadTimeline): string {
  return TIMELINE_PHRASE[timeline];
}

/** A duration in plain words: "under an hour", "18 hours", "3 days". Never negative. */
export function formatDuration(milliseconds: number): string {
  const ms = Math.max(0, milliseconds);
  const hours = ms / 3_600_000;
  if (hours < 1) return "under an hour";
  if (hours < 48) {
    const whole = Math.floor(hours);
    return whole === 1 ? "1 hour" : `${whole} hours`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** "SITE_VISIT_SCHEDULED" -> "Site visit scheduled". */
export function formatEnumLabel(value: string): string {
  const spaced = value.toLowerCase().replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "6 Oct, 3:30 pm" in the founder's time zone (see FOUNDER_TIME_ZONE) — deterministic regardless of the server's own zone. */
export function formatDateTime(date: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}
