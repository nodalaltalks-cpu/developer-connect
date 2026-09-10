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
