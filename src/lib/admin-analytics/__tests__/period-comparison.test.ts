import { test } from "node:test";
import assert from "node:assert/strict";
import { comparePeriods, MIN_SAMPLE_FOR_COMPARISON } from "../period-comparison.ts";

test("comparePeriods: with only 6 total searches, the spec's own example, reports insufficient data rather than a percentage", () => {
  const comparison = comparePeriods(6, 0);
  assert.equal(comparison.sufficientData, false);
  assert.equal(comparison.currentValue, 6);
  assert.equal(comparison.previousValue, 0);
});

test("comparePeriods: sufficientData is true once combined volume reaches the documented threshold", () => {
  const justUnder = comparePeriods(MIN_SAMPLE_FOR_COMPARISON - 1, 0);
  const exactly = comparePeriods(MIN_SAMPLE_FOR_COMPARISON, 0);
  assert.equal(justUnder.sufficientData, false);
  assert.equal(exactly.sufficientData, true);
});

test("comparePeriods: percentChange is null when the previous period was zero — never a fabricated +Infinity/+200%", () => {
  const comparison = comparePeriods(20, 0);
  assert.equal(comparison.percentChange, null);
  assert.equal(comparison.absoluteChange, 20);
});

test("comparePeriods: a real percent change is computed correctly when both periods have data", () => {
  const comparison = comparePeriods(15, 10);
  assert.equal(comparison.absoluteChange, 5);
  assert.equal(comparison.percentChange, 50);
  assert.equal(comparison.sufficientData, true);
});

test("comparePeriods: a decline is represented as a negative change, not hidden", () => {
  const comparison = comparePeriods(5, 10);
  assert.equal(comparison.absoluteChange, -5);
  assert.equal(comparison.percentChange, -50);
});
