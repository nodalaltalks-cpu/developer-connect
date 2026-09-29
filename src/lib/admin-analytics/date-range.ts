/**
 * The Founder Dashboard's ONE reusable date-range engine (global analytics
 * date filter). Every dashboard page that respects the selected range
 * calls `resolveDateRange()` and passes its `{ start, end }` straight into
 * a WHERE clause — nobody computes a boundary independently.
 *
 * TIMEZONE: Asia/Kolkata (IST, UTC+5:30), fixed. This is a business
 * decision (Developer Connects' real markets), not a Vercel/server
 * default — the server itself may run in UTC, but "today," "this month",
 * etc. are always evaluated as IST calendar dates. India does not observe
 * daylight saving time, so a FIXED +330 minute offset is correct
 * year-round; there is no DST transition to special-case.
 *
 * The database itself keeps storing UTC timestamps unchanged (every
 * `timestamp` column in schema.ts already is `withTimezone: true`,
 * Postgres's own UTC-internally representation) — this module only
 * converts an IST CALENDAR boundary into the equivalent UTC `Date`
 * instant before it ever reaches a query. Nothing about storage changes.
 *
 * MODEL: inclusive-start / exclusive-end. Every range's `end` is the
 * instant "start of tomorrow, IST" — never a literal `now` timestamp.
 * Two reasons:
 *   1. A period like "this month" or "this year" is, by definition
 *      (see YEAR below), a PARTIAL/ongoing period — from its calendar
 *      start through today, not through some arbitrary later moment.
 *      Anchoring `end` to "start of tomorrow" makes every range mean
 *      "from its start, through the end of today" — consistent, and
 *      exactly what the YEAR range's own spec ("January 1 -> current
 *      date") already implies for every other range too.
 *   2. It makes the query reproducible for the rest of the calendar day:
 *      selecting the same range twice within the same day returns the
 *      same numbers, rather than silently shrinking/growing the window
 *      by however many seconds passed between the two requests.
 */

export const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330; // UTC+5:30, fixed (no DST in India)
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DATE_RANGE_KEYS = ["day", "week", "month", "quarter", "6months", "12months", "year"] as const;
export type DateRangeKey = (typeof DATE_RANGE_KEYS)[number];

export const DEFAULT_DATE_RANGE_KEY: DateRangeKey = "month";

/** The global filter's exact option list/order and short button label. */
export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "6months", label: "6 Months" },
  { key: "12months", label: "12 Months" },
  { key: "year", label: "Year" },
];

export interface ResolvedDateRange {
  key: DateRangeKey;
  /** Inclusive start, as a real UTC instant — use with `>=`. */
  start: Date;
  /** Exclusive end, as a real UTC instant — use with `<`. Always "start of tomorrow, IST". */
  end: Date;
  timezone: typeof IST_TIMEZONE;
  /** Human-readable, e.g. "September 2026" or "Sep 1 – Sep 29, 2026" — always derived from `start`/`end`, never hard-coded. */
  label: string;
}

/** Reads a `Date` as if its UTC getters were IST wall-clock fields — e.g. `toIstShifted(now).getUTCHours()` is the current IST hour. */
function toIstShifted(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** The inverse: builds the real UTC instant for a given IST wall-clock date/time. `Date.UTC`'s own overflow normalization (month 12 -> next January, day 0 -> previous month's last day, etc.) is relied on deliberately — see subtractMonthsClamped below for the one case where that normalization would be WRONG and is avoided. */
function fromIstWallClock(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, second, ms) - IST_OFFSET_MS);
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of "next month" is the last day of `month` — a standard trick, never a scan.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Subtracts `n` calendar months from an IST wall-clock date, CLAMPING the
 * day rather than letting it overflow into a later month. Plain
 * `Date.UTC(y, m - 6, d)` would silently misbehave for a date like Aug 31
 * minus 6 months: month index lands on February, but February has no 31st,
 * so the JS Date engine normalizes by rolling forward into March —
 * "6 months before Aug 31" would come out as "Mar 2 or 3", which is not
 * what anyone means by a rolling 6-month window. Clamping to the target
 * month's real last day (e.g. Feb 28/29) is the standard, unsurprising
 * convention this project uses instead.
 */
function subtractMonthsClamped(
  year: number,
  month: number,
  day: number,
  n: number,
): { year: number; month: number; day: number } {
  const totalMonths = year * 12 + month - n;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return { year: targetYear, month: targetMonth, day: clampedDay };
}

const FULL_DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "long",
});

/** `end` is exclusive (start of tomorrow) — the label always shows the actual last INCLUDED day, i.e. `end` minus one day, never the exclusive boundary itself. */
function buildLabel(key: DateRangeKey, start: Date, end: Date): string {
  const lastIncludedDay = new Date(end.getTime() - DAY_MS);

  if (key === "day") return FULL_DATE_FORMAT.format(start);
  if (key === "month") return MONTH_YEAR_FORMAT.format(start);
  return `${FULL_DATE_FORMAT.format(start)} – ${FULL_DATE_FORMAT.format(lastIncludedDay)}`;
}

/**
 * Resolves ONE of the seven global-filter options into a concrete
 * `{ start, end }` UTC instant pair, evaluated against IST "today".
 * `now` is a parameter (defaulting to the real current time) purely so
 * this stays deterministically testable — every real caller in the app
 * omits it and gets the genuine current moment.
 */
export function resolveDateRange(key: DateRangeKey, now: Date = new Date()): ResolvedDateRange {
  const nowIst = toIstShifted(now);
  const year = nowIst.getUTCFullYear();
  const month = nowIst.getUTCMonth(); // 0-11
  const day = nowIst.getUTCDate();

  // Common to every range — see the module doc comment for why "start of
  // tomorrow" is the one exclusive-end boundary shared by all seven.
  const end = fromIstWallClock(year, month, day + 1);

  let start: Date;
  switch (key) {
    case "day":
      start = fromIstWallClock(year, month, day);
      break;
    case "week": {
      // Monday start — no existing week-start convention was found
      // anywhere else in this codebase (checked: no ISO-week/locale-week
      // usage exists today), so this follows the task's own documented
      // fallback.
      const dayOfWeek = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0=Sun..6=Sat
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      start = fromIstWallClock(year, month, day - daysSinceMonday);
      break;
    }
    case "month":
      start = fromIstWallClock(year, month, 1);
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      start = fromIstWallClock(year, quarterStartMonth, 1);
      break;
    }
    case "6months": {
      const t = subtractMonthsClamped(year, month, day, 6);
      start = fromIstWallClock(t.year, t.month, t.day);
      break;
    }
    case "12months": {
      const t = subtractMonthsClamped(year, month, day, 12);
      start = fromIstWallClock(t.year, t.month, t.day);
      break;
    }
    case "year":
      start = fromIstWallClock(year, 0, 1);
      break;
  }

  return { key, start, end, timezone: IST_TIMEZONE, label: buildLabel(key, start, end) };
}

/**
 * The "current selected range vs. equal-length previous period" comparison
 * the Overview page uses (replacing the old hardcoded 7-day-vs-7-day
 * window). Deliberately computed per range TYPE, not as a generic
 * "same millisecond duration, shifted back" subtraction — for a calendar
 * range (day/week/month/quarter), a human's idea of "the previous one" is
 * the previous CALENDAR unit (e.g. previous month), even though a
 * previous month may have a different number of days than the current
 * one. For the two rolling ranges (6/12 months), "equal-length" is
 * unambiguous: the same number of months immediately before the current
 * window's start.
 *
 * YEAR is the one genuinely ambiguous case: the current "year" range is
 * always a PARTIAL year (Jan 1 -> today), so its naive "previous year"
 * would be a full 365-day window — a misleadingly larger comparison
 * denominator than the current partial year. Instead this mirrors the
 * SAME month/day cutoff onto the previous year (e.g. current = Jan 1 -
 * Sep 29 2026, previous = Jan 1 - Sep 29 2025) — a standard
 * "year-to-date vs. year-to-date" comparison, and genuinely equal-length.
 */
export function getPreviousPeriod(resolved: ResolvedDateRange): { start: Date; end: Date } {
  const startIst = toIstShifted(resolved.start);
  const year = startIst.getUTCFullYear();
  const month = startIst.getUTCMonth();
  const day = startIst.getUTCDate();

  switch (resolved.key) {
    case "day":
      return { start: fromIstWallClock(year, month, day - 1), end: resolved.start };
    case "week":
      return { start: fromIstWallClock(year, month, day - 7), end: resolved.start };
    case "month":
      return { start: fromIstWallClock(year, month - 1, 1), end: resolved.start };
    case "quarter":
      return { start: fromIstWallClock(year, month - 3, 1), end: resolved.start };
    case "6months": {
      const t = subtractMonthsClamped(year, month, day, 6);
      return { start: fromIstWallClock(t.year, t.month, t.day), end: resolved.start };
    }
    case "12months": {
      const t = subtractMonthsClamped(year, month, day, 12);
      return { start: fromIstWallClock(t.year, t.month, t.day), end: resolved.start };
    }
    case "year": {
      const endIst = toIstShifted(resolved.end);
      return {
        start: fromIstWallClock(year - 1, 0, 1),
        end: fromIstWallClock(year - 1, endIst.getUTCMonth(), endIst.getUTCDate()),
      };
    }
  }
}

/** Validates a raw `?range=` value, defaulting to MONTH for anything missing/unrecognized — never throws on a stale/hand-edited URL. */
export function parseDateRangeKey(value: string | string[] | undefined): DateRangeKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return (DATE_RANGE_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as DateRangeKey)
    : DEFAULT_DATE_RANGE_KEY;
}
