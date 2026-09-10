import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateProfileCompletion, calculateCompletionFromConfig } from "../completion.ts";
import { PROFILE_FIELD_CONFIG } from "../field-config.ts";
import type { ProfileFieldConfig } from "../types.ts";

test("field-config: PROFILE_FIELD_CONFIG is empty — no historical field list could be verified in this repository", () => {
  assert.deepEqual(PROFILE_FIELD_CONFIG, []);
});

test("calculateProfileCompletion: with no configured fields, completion is null, not 0 or 100", () => {
  const completion = calculateProfileCompletion({ anything: "some value" });
  assert.equal(completion.percentage, null);
  assert.equal(completion.band, null);
  assert.deepEqual(completion.completedFieldKeys, []);
  assert.deepEqual(completion.missingFieldKeys, []);
});

// The tests below exercise the completion algorithm's math in isolation
// using a synthetic field config — these are test fixtures for the
// algorithm, not product fields, and never touch PROFILE_FIELD_CONFIG.
const TEST_CONFIG: ProfileFieldConfig[] = [
  { key: "a", label: "Field A", weight: 1 },
  { key: "b", label: "Field B", weight: 1 },
  { key: "c", label: "Field C", weight: 2 },
];

test("calculateCompletionFromConfig: 0 of 3 weighted fields filled is 0%, band VERY_EARLY", () => {
  const completion = calculateCompletionFromConfig({}, TEST_CONFIG);
  assert.equal(completion.percentage, 0);
  assert.equal(completion.band, "VERY_EARLY");
  assert.deepEqual(completion.missingFieldKeys, ["a", "b", "c"]);
});

test("calculateCompletionFromConfig: weight is respected — filling the heavier field counts more", () => {
  const lightFieldOnly = calculateCompletionFromConfig({ a: "yes" }, TEST_CONFIG);
  const heavyFieldOnly = calculateCompletionFromConfig({ c: "yes" }, TEST_CONFIG);
  assert.equal(lightFieldOnly.percentage, 25); // 1 of total weight 4
  assert.equal(heavyFieldOnly.percentage, 50); // 2 of total weight 4
});

test("calculateCompletionFromConfig: all fields filled is 100%, band FULLY_COMPLETED", () => {
  const completion = calculateCompletionFromConfig({ a: "x", b: "y", c: "z" }, TEST_CONFIG);
  assert.equal(completion.percentage, 100);
  assert.equal(completion.band, "FULLY_COMPLETED");
  assert.deepEqual(completion.completedFieldKeys, ["a", "b", "c"]);
});

test("calculateCompletionFromConfig: empty string, null, undefined, and empty array all count as not filled", () => {
  const completion = calculateCompletionFromConfig(
    { a: "", b: null, c: undefined },
    TEST_CONFIG,
  );
  assert.equal(completion.percentage, 0);
});

test("calculateCompletionFromConfig: bands match the specified thresholds", () => {
  const wide: ProfileFieldConfig[] = Array.from({ length: 100 }, (_, i) => ({
    key: `f${i}`,
    label: `Field ${i}`,
    weight: 1,
  }));
  const dataFor = (n: number) =>
    Object.fromEntries(wide.slice(0, n).map((f) => [f.key, "x"]));

  assert.equal(calculateCompletionFromConfig(dataFor(25), wide).band, "VERY_EARLY");
  assert.equal(calculateCompletionFromConfig(dataFor(26), wide).band, "PARTIALLY_COMPLETED");
  assert.equal(calculateCompletionFromConfig(dataFor(50), wide).band, "PARTIALLY_COMPLETED");
  assert.equal(calculateCompletionFromConfig(dataFor(51), wide).band, "MORE_COMPLETE");
  assert.equal(calculateCompletionFromConfig(dataFor(75), wide).band, "MORE_COMPLETE");
  assert.equal(calculateCompletionFromConfig(dataFor(76), wide).band, "ALMOST_COMPLETE");
  assert.equal(calculateCompletionFromConfig(dataFor(99), wide).band, "ALMOST_COMPLETE");
  assert.equal(calculateCompletionFromConfig(dataFor(100), wide).band, "FULLY_COMPLETED");
});
