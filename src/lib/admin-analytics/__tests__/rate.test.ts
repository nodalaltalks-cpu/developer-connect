import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRate, formatRate } from "../rate.ts";

test("computeRate: a normal rate carries numerator, denominator, and a rounded percent", () => {
  const rate = computeRate(1, 3);
  assert.equal(rate.numerator, 1);
  assert.equal(rate.denominator, 3);
  assert.equal(rate.percent, 33.3);
});

test("computeRate: zero denominator yields percent null, never 0", () => {
  const rate = computeRate(0, 0);
  assert.equal(rate.percent, null);
});

test("computeRate: zero numerator with a real denominator is a real 0%, not null", () => {
  const rate = computeRate(0, 5);
  assert.equal(rate.percent, 0);
  assert.equal(rate.denominator, 5);
});

test("formatRate: zero denominator renders N/A", () => {
  assert.equal(formatRate(computeRate(0, 0)), "N/A");
});

test("formatRate: always shows the underlying counts, matching the spec's own example format", () => {
  assert.equal(formatRate(computeRate(1, 2)), "50% (1 of 2)");
  assert.equal(formatRate(computeRate(1, 3)), "33.3% (1 of 3)");
});
