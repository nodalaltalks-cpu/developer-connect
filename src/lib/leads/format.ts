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

/** The exact amount with no abbreviation ("₹7,77,777", "AED 1,234"): for finance, where a rounded figure would hide money. */
export function formatMoneyExact(amount: number, currency: LeadCurrency): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return currency === "INR" ? `${sign}₹${new Intl.NumberFormat("en-IN").format(abs)}` : `${sign}AED ${new Intl.NumberFormat("en-US").format(abs)}`;
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

/** The business time zone every time on a lead is shown in (India; no daylight saving). Instants are stored as UTC timestamptz. */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

/** "10 Oct 2026, 10:42 AM" in the business time zone — deterministic regardless of the server's or browser's own zone. */
export function formatDateTimeFull(date: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

/** "2h 18m" / "45m" / "3d 4h" — how long ago a scheduled time passed. Never negative. */
export function formatOverdue(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (totalMinutes < 1) return "under a minute";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/**
 * The inverse of businessLocalToInstant: an instant as the "YYYY-MM-DDTHH:mm" a datetime-local input shows, in the BUSINESS time
 * zone (not the browser's). Used for defaults, minimums and quick-reschedule presets, so what the employee sees is the same clock
 * the server reads. `addDays` moves the calendar date (not 24 hours), then `atHour` (if given) sets the clock time on that date.
 */
export function toBusinessLocalInput(instant: Date, options: { addDays?: number; atHour?: number; atMinute?: number } = {}, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + (options.addDays ?? 0), options.atHour ?? get("hour"), options.atHour !== undefined ? (options.atMinute ?? 0) : get("minute")));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * Turns the wall-clock value of a datetime-local input ("2026-10-12T15:30") into the exact instant it means IN THE
 * BUSINESS TIME ZONE — not in whatever zone the browser happens to be set to. Returns null for anything that is not
 * a valid local date-time with minutes (a date alone is not enough: follow-ups need an exact time).
 */
export function businessLocalToInstant(local: string, timeZone = BUSINESS_TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(typeof local === "string" ? local.trim() : "");
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  // The zone's offset at (about) that instant, found with Intl rather than assumed.
  const offsetAt = (instant: number) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(instant));
    const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - instant;
  };
  const first = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(first));
}

/** A datetime-local value ("2026-10-12T10:00") for `days` from `now`, at `hour`:00, in the business time zone. */
export function businessPresetLocal(now: Date, days: number, hour = 10, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now.getTime() + days * 86_400_000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${String(hour).padStart(2, "0")}:00`;
}

/** The full date and time WITH the day of the week ("Thu 09 Oct 2026, 10:32 AM"), in India time. Used where a comment is shown, so its day is never in doubt. */
export function formatDateTimeWithDay(date: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(date);
  return `${weekday} ${formatDateTimeFull(date, timeZone)}`;
}
