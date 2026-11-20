import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPointsToDays,
  assessToday,
  planAdvice,
  ptDateKey,
  shiftDateKey,
  summarizeWindows,
  usageWarnings,
  type DaysMap,
} from "../usage.ts";

test("a Pacific-time day starts at 08:00 UTC in winter and 07:00 UTC in summer", () => {
  assert.equal(ptDateKey(new Date("2026-11-20T07:59:00Z")), "2026-11-19");
  assert.equal(ptDateKey(new Date("2026-11-20T08:00:00Z")), "2026-11-20");
  assert.equal(ptDateKey(new Date("2026-07-20T06:59:00Z")), "2026-07-19");
  assert.equal(ptDateKey(new Date("2026-07-20T07:00:00Z")), "2026-07-20");
});

test("shiftDateKey is calendar arithmetic across month and year ends", () => {
  assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDateKey("2027-01-01", -1), "2026-12-31");
  assert.equal(shiftDateKey("2026-11-20", 10), "2026-11-30");
});

test("hourly points are summed into Pacific days", () => {
  const days: DaysMap = {};
  addPointsToDays(days, "reads", [
    { start: new Date("2026-11-20T07:00:00Z"), value: 100 }, // 23:00 on the 19th
    { start: new Date("2026-11-20T08:00:00Z"), value: 40 }, // 00:00 on the 20th
    { start: new Date("2026-11-20T09:00:00Z"), value: 60 },
  ]);
  addPointsToDays(days, "writes", [{ start: new Date("2026-11-20T09:00:00Z"), value: 7 }]);
  assert.deepEqual(days["2026-11-19"], { reads: 100, writes: 0, deletes: 0 });
  assert.deepEqual(days["2026-11-20"], { reads: 100, writes: 7, deletes: 0 });
});

test("summarizeWindows totals each window, counts recorded days and finds the busiest day", () => {
  const now = new Date("2026-11-20T20:00:00Z"); // 12:00 on the 20th in Pacific time
  const days: DaysMap = {
    "2026-11-20": { reads: 1000, writes: 100, deletes: 0 },
    "2026-11-19": { reads: 36000, writes: 5000, deletes: 0 }, // 72% of reads
    "2026-11-15": { reads: 500, writes: 50, deletes: 0 },
  };
  const by = Object.fromEntries(summarizeWindows(days, now).map((w) => [w.id, w]));
  assert.equal(by.today.totals.reads, 1000);
  assert.equal(by.yesterday.totals.reads, 36000);
  assert.equal(by.week.totals.reads, 37500);
  assert.equal(by.week.daysCovered, 3);
  assert.equal(by.week.daysInWindow, 7);
  assert.equal(by.month.peak.reads.day, "2026-11-19");
  assert.equal(by.month.daysOverWarn, 1);
  assert.equal(by.month.daysOverLimit, 0);
  assert.equal(by.year.daysInWindow, 365);
  assert.equal(by.month.avgPerDay.reads, 12500);
});

test("assessToday warns at 70%, goes red at 90% and projects when the cap would be hit", () => {
  const noon = new Date("2026-11-20T20:00:00Z"); // 12:00 Pacific, half the day elapsed
  assert.equal(assessToday({ reads: 1000, writes: 100, deletes: 0 }, noon).status, "HEALTHY");
  const warn = assessToday({ reads: 36000, writes: 100, deletes: 0 }, noon);
  assert.equal(warn.status, "NEEDS_ATTENTION");
  assert.equal(warn.worst.kind, "reads");
  assert.equal(assessToday({ reads: 46000, writes: 0, deletes: 0 }, noon).status, "ACTION_REQUIRED");
  // 20,000 reads by noon = 40,000 for the day: fine. 30,000 by noon = 60,000: the cap lands around 20:00.
  const paced = assessToday({ reads: 30000, writes: 0, deletes: 0 }, noon);
  assert.equal(paced.status, "NEEDS_ATTENTION");
  assert.equal(paced.capReachedAt?.kind, "reads");
  // 12h elapsed, 30,000 used: the 50,000 cap lands at 12h * 50000/30000 = 20h after Pacific midnight (08:00 UTC) = 04:00 UTC next day.
  assert.equal(paced.capReachedAt?.at.toISOString(), "2026-11-21T04:00:00.000Z");
  assert.equal(paced.projected?.reads, 60000);
});

test("no projection in the first two hours of the Pacific day", () => {
  const early = new Date("2026-11-20T09:00:00Z"); // 01:00 Pacific
  assert.equal(assessToday({ reads: 10000, writes: 0, deletes: 0 }, early).projected, null);
});

test("usageWarnings turns the assessment into founder-readable cards and stays quiet when healthy or already capped", () => {
  const noon = new Date("2026-11-20T20:00:00Z");
  const text = () => "HH:MM";
  assert.equal(usageWarnings(assessToday({ reads: 10, writes: 0, deletes: 0 }, noon), text).length, 0);
  const high = usageWarnings(assessToday({ reads: 36000, writes: 0, deletes: 0 }, noon), text);
  assert.equal(high[0].level, "NEEDS_ATTENTION");
  assert.match(high[0].explanation, /72%/);
  const red = usageWarnings(assessToday({ reads: 47000, writes: 0, deletes: 0 }, noon), text);
  assert.equal(red[0].level, "ACTION_REQUIRED");
  assert.equal(usageWarnings(assessToday({ reads: 50000, writes: 0, deletes: 0 }, noon), text).length, 0);
});

test("planAdvice follows its stated rules", () => {
  const now = new Date("2026-11-20T20:00:00Z");
  const build = (entries: Record<string, number>): DaysMap =>
    Object.fromEntries(Object.entries(entries).map(([k, reads]) => [k, { reads, writes: 0, deletes: 0 }]));
  const month = (days: DaysMap) => summarizeWindows(days, now).find((w) => w.id === "month")!;
  assert.equal(planAdvice(month(build({ "2026-11-20": 5 }))).level, "unknown");
  const quietEntries = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [shiftDateKey("2026-11-20", -i), 1000]));
  const withDays = (extra: Record<string, number>) => month(build({ ...quietEntries, ...extra }));
  assert.equal(planAdvice(withDays({})).level, "ok");
  assert.equal(planAdvice(withDays({ "2026-11-10": 40000 })).level, "watch");
  assert.equal(planAdvice(withDays({ "2026-11-10": 40000, "2026-11-11": 41000, "2026-11-12": 42000 })).level, "upgrade");
  assert.equal(planAdvice(withDays({ "2026-11-10": 50000 })).level, "upgrade");
});
