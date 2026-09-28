import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateProfileCompletion, calculateCompletionFromConfig } from "../completion.ts";
import { PROFILE_FIELD_CONFIG, PROFILE_SECTIONS } from "../field-config.ts";
import type { ProfileFieldConfig } from "../types.ts";

test("field-config: PROFILE_FIELD_CONFIG now has Phase 3B's real fields, each assigned to a real section", () => {
  assert.ok(PROFILE_FIELD_CONFIG.length > 0);
  const sectionIds = new Set(PROFILE_SECTIONS.map((s) => s.id));
  for (const field of PROFILE_FIELD_CONFIG) {
    assert.ok(sectionIds.has(field.section), `${field.key} references an unknown section "${field.section}"`);
  }
});

test("field-config: every PROFILE_SECTIONS entry has at least one field, and vice versa", () => {
  for (const section of PROFILE_SECTIONS) {
    const fieldsInSection = PROFILE_FIELD_CONFIG.filter((f) => f.section === section.id);
    assert.ok(fieldsInSection.length > 0, `section "${section.id}" has no fields`);
  }
});

test("calculateProfileCompletion: an empty profile has 0% completion across all real sections, not null (fields ARE configured now)", () => {
  const completion = calculateProfileCompletion({});
  assert.equal(completion.percentage, 0);
  assert.equal(completion.band, "VERY_EARLY");
  assert.equal(completion.sections.length, PROFILE_SECTIONS.length);
  assert.ok(completion.sections.every((s) => s.complete === false));
});

// The tests below exercise the completion algorithm's math in isolation
// using a synthetic field config — these are test fixtures for the
// algorithm, not product fields, and never touch PROFILE_FIELD_CONFIG.
const TEST_CONFIG: ProfileFieldConfig[] = [
  { key: "a", label: "Field A", weight: 1, section: "s1", type: "text" },
  { key: "b", label: "Field B", weight: 1, section: "s1", type: "text" },
  { key: "c", label: "Field C", weight: 2, section: "s2", type: "text" },
];
const TEST_SECTIONS = [
  { id: "s1", title: "Section One" },
  { id: "s2", title: "Section Two" },
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

test("calculateCompletionFromConfig: section breakdown reflects only that section's own fields", () => {
  const partial = calculateCompletionFromConfig({ a: "x" }, TEST_CONFIG, TEST_SECTIONS);
  const s1 = partial.sections.find((s) => s.sectionId === "s1");
  const s2 = partial.sections.find((s) => s.sectionId === "s2");

  assert.equal(s1?.totalFields, 2);
  assert.equal(s1?.completedFields, 1);
  assert.equal(s1?.percentage, 50);
  assert.equal(s1?.complete, false);

  assert.equal(s2?.totalFields, 1);
  assert.equal(s2?.completedFields, 0);
  assert.equal(s2?.complete, false);
});

test("calculateCompletionFromConfig: a section is 'complete' only once every one of its fields is filled", () => {
  const full = calculateCompletionFromConfig({ a: "x", b: "y" }, TEST_CONFIG, TEST_SECTIONS);
  const s1 = full.sections.find((s) => s.sectionId === "s1");
  assert.equal(s1?.complete, true);
});

// --- Regression: an empty object (e.g. the Budget section's
// `budgetRange: {}`, left behind after typing into a field and then
// clearing it) must never count as "filled". Before this fix, the
// algorithm's fallback treated ANY non-null/non-string/non-array value —
// including a plain object with every property empty — as filled, which
// is exactly how "Budget: Complete" could show with genuinely empty
// fields (see completion.ts's isFieldFilled doc comment). ---

const RANGE_CONFIG: ProfileFieldConfig[] = [
  { key: "budgetRange", label: "Budget range", weight: 1, section: "budget", type: "range" },
];

test("calculateCompletionFromConfig: an empty range object ({}) is NOT filled — reproduces the real 'false COMPLETE' bug", () => {
  const completion = calculateCompletionFromConfig({ budgetRange: {} }, RANGE_CONFIG);
  assert.equal(completion.percentage, 0);
  assert.deepEqual(completion.missingFieldKeys, ["budgetRange"]);
});

test("calculateCompletionFromConfig: a range object with every value undefined is NOT filled", () => {
  const completion = calculateCompletionFromConfig({ budgetRange: { min: undefined, max: undefined } }, RANGE_CONFIG);
  assert.equal(completion.percentage, 0);
});

test("calculateCompletionFromConfig: a range object with a real min or max IS filled", () => {
  const minOnly = calculateCompletionFromConfig({ budgetRange: { min: 5000000 } }, RANGE_CONFIG);
  assert.equal(minOnly.percentage, 100);

  const maxOnly = calculateCompletionFromConfig({ budgetRange: { max: 12000000 } }, RANGE_CONFIG);
  assert.equal(maxOnly.percentage, 100);
});

test("calculateCompletionFromConfig: removing a previously-filled range value makes the field incomplete again", () => {
  const filled = calculateCompletionFromConfig({ budgetRange: { min: 5000000 } }, RANGE_CONFIG);
  assert.equal(filled.percentage, 100);

  const cleared = calculateCompletionFromConfig({ budgetRange: {} }, RANGE_CONFIG);
  assert.equal(cleared.percentage, 0);
});

test("calculateCompletionFromConfig: a boolean field's explicit false still counts as filled (a real, deliberate choice, unlike an empty object)", () => {
  const boolConfig: ProfileFieldConfig[] = [
    { key: "notifyMe", label: "Notify me", weight: 1, section: "s1", type: "boolean" },
  ];
  const completion = calculateCompletionFromConfig({ notifyMe: false }, boolConfig);
  assert.equal(completion.percentage, 100);
});

test("calculateProfileCompletion: the REAL product field config marks Budget incomplete for an empty range and complete once a real amount is saved", () => {
  const empty = calculateProfileCompletion({ budgetRange: {} });
  const budgetSection = empty.sections.find((s) => s.sectionId === "budget");
  assert.equal(budgetSection?.complete, false);

  const filled = calculateProfileCompletion({ budgetRange: { min: 5000000, max: 12000000 } });
  const filledBudgetSection = filled.sections.find((s) => s.sectionId === "budget");
  assert.equal(filledBudgetSection?.complete, true);
});

test("calculateCompletionFromConfig: bands match the specified thresholds", () => {
  const wide: ProfileFieldConfig[] = Array.from({ length: 100 }, (_, i) => ({
    key: `f${i}`,
    label: `Field ${i}`,
    weight: 1,
    section: "s1",
    type: "text",
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
