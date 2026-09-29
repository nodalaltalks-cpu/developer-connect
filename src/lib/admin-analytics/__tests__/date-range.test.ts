import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDateRange,
  getPreviousPeriod,
  parseDateRangeKey,
  DATE_RANGE_KEYS,
  DEFAULT_DATE_RANGE_KEY,
  IST_TIMEZONE,
} from "../date-range.ts";

// Anchor: 2026-09-29T10:00:00Z = 2026-09-29T15:30:00 IST (a Tuesday) —
// every expected boundary below was independently hand-derived (see the
// implementation task's own report) and cross-checked against this
// anchor before being locked in here.
const NOW = new Date("2026-09-29T10:00:00.000Z");

test("date-range: exposes the exact seven options, Month as the default", () => {
  assert.deepEqual(DATE_RANGE_KEYS, ["day", "week", "month", "quarter", "6months", "12months", "year"]);
  assert.equal(DEFAULT_DATE_RANGE_KEY, "month");
});

test("date-range: timezone is always Asia/Kolkata", () => {
  assert.equal(resolveDateRange("day", NOW).timezone, IST_TIMEZONE);
});

test("date-range: DAY is the current IST calendar day, midnight to midnight", () => {
  const r = resolveDateRange("day", NOW);
  assert.equal(r.start.toISOString(), "2026-09-28T18:30:00.000Z"); // 2026-09-29T00:00 IST
  assert.equal(r.end.toISOString(), "2026-09-29T18:30:00.000Z"); // 2026-09-30T00:00 IST
});

test("date-range: WEEK starts on Monday (no prior week-start convention exists in this codebase)", () => {
  const r = resolveDateRange("week", NOW);
  // 2026-09-29 is a Tuesday -> the week's Monday is 2026-09-28.
  assert.equal(r.start.toISOString(), "2026-09-27T18:30:00.000Z"); // 2026-09-28T00:00 IST (Monday)
  assert.equal(r.end.toISOString(), "2026-09-29T18:30:00.000Z");
});

test("date-range: MONTH is the 1st of the current IST month through today", () => {
  const r = resolveDateRange("month", NOW);
  assert.equal(r.start.toISOString(), "2026-08-31T18:30:00.000Z"); // 2026-09-01T00:00 IST
  assert.equal(r.label, "September 2026");
});

test("date-range: QUARTER is the current calendar quarter's start (Jul 1 for Sep)", () => {
  const r = resolveDateRange("quarter", NOW);
  assert.equal(r.start.toISOString(), "2026-06-30T18:30:00.000Z"); // 2026-07-01T00:00 IST
});

test("date-range: 6 MONTHS is a rolling window ending today, starting exactly 6 calendar months back", () => {
  const r = resolveDateRange("6months", NOW);
  assert.equal(r.start.toISOString(), "2026-03-28T18:30:00.000Z"); // 2026-03-29T00:00 IST
});

test("date-range: 12 MONTHS is a rolling window, and is genuinely different from YEAR", () => {
  const twelveMonths = resolveDateRange("12months", NOW);
  const year = resolveDateRange("year", NOW);

  assert.equal(twelveMonths.start.toISOString(), "2025-09-28T18:30:00.000Z"); // 2025-09-29T00:00 IST
  assert.equal(year.start.toISOString(), "2025-12-31T18:30:00.000Z"); // 2026-01-01T00:00 IST

  assert.notEqual(twelveMonths.start.getTime(), year.start.getTime());
  assert.ok(twelveMonths.start.getTime() < year.start.getTime(), "12 months reaches further back than the current calendar year");
});

test("date-range: YEAR is January 1 of the current IST year through today", () => {
  const r = resolveDateRange("year", NOW);
  assert.equal(r.start.toISOString(), "2025-12-31T18:30:00.000Z"); // 2026-01-01T00:00 IST
  assert.equal(r.label, "1 January 2026 – 29 September 2026");
});

test("date-range: every range shares the exact same exclusive end boundary for the same `now`", () => {
  const ends = DATE_RANGE_KEYS.map((key) => resolveDateRange(key, NOW).end.toISOString());
  assert.ok(ends.every((e) => e === ends[0]), "all seven ranges must end at the same instant (start of tomorrow, IST)");
  assert.equal(ends[0], "2026-09-29T18:30:00.000Z");
});

test("date-range: end is exclusive — start of tomorrow, never a same-day instant that could double-count midnight", () => {
  const r = resolveDateRange("day", NOW);
  const oneMsBeforeEnd = new Date(r.end.getTime() - 1);
  assert.ok(oneMsBeforeEnd >= r.start && oneMsBeforeEnd < r.end);
  assert.ok(r.end.getTime() - r.start.getTime() === 24 * 60 * 60 * 1000, "DAY spans exactly 24 hours");
});

test("date-range: subtracting 6 months from Aug 31 clamps into February rather than overflowing into March", () => {
  const nonLeap = resolveDateRange("6months", new Date("2027-08-31T10:00:00.000Z"));
  assert.equal(nonLeap.start.toISOString(), "2027-02-27T18:30:00.000Z"); // 2027-02-28T00:00 IST — Feb 2027 has 28 days

  const leap = resolveDateRange("6months", new Date("2028-08-31T10:00:00.000Z"));
  assert.equal(leap.start.toISOString(), "2028-02-28T18:30:00.000Z"); // 2028-02-29T00:00 IST — 2028 IS a leap year
});

test("date-range: getPreviousPeriod — MONTH gives the previous calendar month, ending exactly where the current one starts", () => {
  const current = resolveDateRange("month", NOW);
  const previous = getPreviousPeriod(current);
  assert.equal(previous.start.toISOString(), "2026-07-31T18:30:00.000Z"); // 2026-08-01T00:00 IST
  assert.equal(previous.end.toISOString(), current.start.toISOString());
});

test("date-range: getPreviousPeriod — QUARTER gives the previous calendar quarter", () => {
  const current = resolveDateRange("quarter", NOW);
  const previous = getPreviousPeriod(current);
  assert.equal(previous.start.toISOString(), "2026-03-31T18:30:00.000Z"); // 2026-04-01T00:00 IST
  assert.equal(previous.end.toISOString(), current.start.toISOString());
});

test("date-range: getPreviousPeriod — 12 MONTHS gives the preceding rolling 12-month window (24 months back)", () => {
  const current = resolveDateRange("12months", NOW);
  const previous = getPreviousPeriod(current);
  assert.equal(previous.start.toISOString(), "2024-09-28T18:30:00.000Z"); // 2024-09-29T00:00 IST
  assert.equal(previous.end.toISOString(), current.start.toISOString());
});

test("date-range: getPreviousPeriod — YEAR compares the same year-to-date cutoff, not a full previous year (equal-length, never a misleading 365-day denominator)", () => {
  const current = resolveDateRange("year", NOW);
  const previous = getPreviousPeriod(current);
  assert.equal(previous.start.toISOString(), "2024-12-31T18:30:00.000Z"); // 2025-01-01T00:00 IST
  assert.equal(previous.end.toISOString(), "2025-09-29T18:30:00.000Z"); // 2025-09-30T00:00 IST — same Sep-29 cutoff as the current (partial) year
  const previousDurationMs = previous.end.getTime() - previous.start.getTime();
  const currentDurationMs = current.end.getTime() - current.start.getTime();
  assert.equal(previousDurationMs, currentDurationMs, "the previous year-to-date slice must be exactly as long as the current one");
});

test("date-range: parseDateRangeKey defaults to Month for missing or unrecognized values, never throws", () => {
  assert.equal(parseDateRangeKey(undefined), "month");
  assert.equal(parseDateRangeKey(""), "month");
  assert.equal(parseDateRangeKey("nonsense"), "month");
  assert.equal(parseDateRangeKey(["quarter", "year"]), "quarter");
  for (const key of DATE_RANGE_KEYS) {
    assert.equal(parseDateRangeKey(key), key);
  }
});
