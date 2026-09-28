import { test } from "node:test";
import assert from "node:assert/strict";
import { isProfileVerified } from "../verification.ts";
import type { ProfileCompletion } from "../types.ts";

function completionWith(percentage: number | null, missingFieldKeys: string[]): ProfileCompletion {
  return { percentage, band: null, completedFieldKeys: [], missingFieldKeys, sections: [] };
}

test("isProfileVerified: false when the profile is not genuinely 100% (missing fields remain), even with a verified email", () => {
  assert.equal(isProfileVerified(completionWith(99, ["phone"]), true), false);
});

test("isProfileVerified: false when the profile is 100% but the account email is not verified — opening the page alone never grants it", () => {
  assert.equal(isProfileVerified(completionWith(100, []), false), false);
});

test("isProfileVerified: false when percentage is null (no fields configured)", () => {
  assert.equal(isProfileVerified(completionWith(null, []), true), false);
});

test("isProfileVerified: true only when both real conditions hold", () => {
  assert.equal(isProfileVerified(completionWith(100, []), true), true);
});
