import { test } from "node:test";
import assert from "node:assert/strict";
import { delayInterest } from "../delay-interest.ts";

const base = { amountPaid: 1_000_000, annualRatePercent: 10 };

test("two whole months of delay: days, months and simple interest", () => {
  const r = delayInterest({ ...base, promisedDate: "2025-01-01", untilDate: "2025-03-01" });
  assert.equal(r.valid, true);
  assert.equal(r.delayDays, 59);
  assert.equal(r.months, 2);
  assert.equal(r.days, 0);
  assert.ok(Math.abs(r.interest - (1_000_000 * 0.1 * 59) / 365) < 0.01);
  assert.ok(Math.abs(r.perMonth - 1_000_000 * 0.1 / 12) < 0.01);
});

test("a delay that crosses a month end counts months from the promised day", () => {
  const r = delayInterest({ ...base, promisedDate: "2025-01-31", untilDate: "2025-03-01" });
  assert.equal(r.delayDays, 29);
  assert.equal(r.months, 1);
  assert.equal(r.days, 1);
});

test("no delay, or an early handover, owes nothing but still reports the monthly rate", () => {
  const same = delayInterest({ ...base, promisedDate: "2025-06-01", untilDate: "2025-06-01" });
  assert.equal(same.valid, true);
  assert.equal(same.interest, 0);
  assert.equal(same.delayDays, 0);
  const early = delayInterest({ ...base, promisedDate: "2025-06-01", untilDate: "2025-05-01" });
  assert.equal(early.interest, 0);
  assert.ok(early.perMonth > 0);
});

test("a delay over a year gives years as months and the right day count", () => {
  const r = delayInterest({ ...base, promisedDate: "2024-03-15", untilDate: "2026-03-14" });
  assert.equal(r.delayDays, 729);
  assert.equal(r.months, 23);
  assert.equal(r.days, 27);
});

test("missing or invalid input is refused with a plain reason", () => {
  assert.equal(delayInterest({ ...base, amountPaid: 0, promisedDate: "2025-01-01", untilDate: "2025-02-01" }).valid, false);
  assert.equal(delayInterest({ ...base, annualRatePercent: 0, promisedDate: "2025-01-01", untilDate: "2025-02-01" }).valid, false);
  assert.match(delayInterest({ ...base, promisedDate: "", untilDate: "2025-02-01" }).reason, /possession date/i);
  assert.match(delayInterest({ ...base, promisedDate: "2025-01-01", untilDate: "2025-02-30" }).reason, /handover date/i);
  assert.equal(delayInterest({ ...base, amountPaid: Number.NaN, promisedDate: "2025-01-01", untilDate: "2025-02-01" }).valid, false);
});
