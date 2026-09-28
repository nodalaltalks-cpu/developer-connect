import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCelebrate } from "../celebration.ts";
import type { ProfileCompletion, ProfileSectionCompletion } from "../types.ts";

function section(sectionId: string, title: string, complete: boolean): ProfileSectionCompletion {
  return { sectionId, title, totalFields: 1, completedFields: complete ? 1 : 0, percentage: complete ? 100 : 0, complete };
}

function completion(percentage: number | null, sections: ProfileSectionCompletion[]): ProfileCompletion {
  return { percentage, band: null, completedFieldKeys: [], missingFieldKeys: [], sections };
}

test("shouldCelebrate: fires when a section genuinely goes incomplete -> complete and the percentage increases", () => {
  const before = completion(25, [section("budget", "Budget", false)]);
  const after = completion(50, [section("budget", "Budget", true)]);

  const result = shouldCelebrate(before, after);
  assert.equal(result.show, true);
  assert.equal(result.sectionTitle, "Budget");
  assert.equal(result.percentage, 50);
});

test("shouldCelebrate: does NOT fire when saving an already-complete section again", () => {
  const before = completion(50, [section("budget", "Budget", true)]);
  const after = completion(50, [section("budget", "Budget", true)]);

  assert.equal(shouldCelebrate(before, after).show, false);
});

test("shouldCelebrate: does NOT fire when nothing changed (e.g. a page reload re-running with identical data)", () => {
  const state = completion(50, [section("budget", "Budget", true), section("purpose", "Purpose", false)]);
  assert.equal(shouldCelebrate(state, state).show, false);
});

test("shouldCelebrate: does NOT fire when the percentage has not actually increased, even if a section flag looks different", () => {
  // A section completing while another was simultaneously cleared in the
  // same save nets zero real progress — must never celebrate a wash.
  const before = completion(50, [
    section("budget", "Budget", false),
    section("purpose", "Purpose", true),
  ]);
  const after = completion(50, [
    section("budget", "Budget", true),
    section("purpose", "Purpose", false),
  ]);

  assert.equal(shouldCelebrate(before, after).show, false);
});

test("shouldCelebrate: does NOT fire when percentage is null (no fields configured)", () => {
  const before = completion(null, []);
  const after = completion(null, []);
  assert.equal(shouldCelebrate(before, after).show, false);
});

test("shouldCelebrate: reports the FIRST newly-completed section when several complete in one save", () => {
  const before = completion(0, [
    section("personal-details", "Personal Details", false),
    section("budget", "Budget", false),
  ]);
  const after = completion(50, [
    section("personal-details", "Personal Details", true),
    section("budget", "Budget", true),
  ]);

  assert.equal(shouldCelebrate(before, after).sectionTitle, "Personal Details");
});
