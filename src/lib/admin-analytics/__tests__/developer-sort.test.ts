import { test } from "node:test";
import assert from "node:assert/strict";
import { sortDevelopers, filterDevelopersByStatus, filterDevelopersByName } from "../developer-sort.ts";
import { computeRate } from "../rate.ts";
import type { DeveloperStat } from "../types.ts";

function stat(overrides: Partial<DeveloperStat>): DeveloperStat {
  return {
    developerId: "id",
    displayName: "Test Developer",
    slug: "test-developer",
    verificationStatus: null,
    searchResultClicks: 0,
    pageViews: 0,
    officialWebsiteClicks: 0,
    ctr: computeRate(0, 0),
    ...overrides,
  };
}

const a = stat({ developerId: "a", displayName: "A Co", pageViews: 10, officialWebsiteClicks: 5, ctr: computeRate(5, 10) });
const b = stat({ developerId: "b", displayName: "B Co", pageViews: 30, officialWebsiteClicks: 3, ctr: computeRate(3, 30) });
const c = stat({ developerId: "c", displayName: "C Co", pageViews: 0, officialWebsiteClicks: 0, ctr: computeRate(0, 0) });

test("sortDevelopers: descending by pageViews puts the highest-traffic developer first", () => {
  const sorted = sortDevelopers([a, b, c], "pageViews", "desc");
  assert.deepEqual(sorted.map((d) => d.developerId), ["b", "a", "c"]);
});

test("sortDevelopers: ascending reverses the order", () => {
  const sorted = sortDevelopers([a, b, c], "pageViews", "asc");
  assert.deepEqual(sorted.map((d) => d.developerId), ["c", "a", "b"]);
});

test("sortDevelopers: sorting by ctr treats N/A (no page views) as lowest, never outranking a real rate", () => {
  const sorted = sortDevelopers([a, b, c], "ctr", "desc");
  assert.equal(sorted[sorted.length - 1].developerId, "c"); // c has ctr.percent === null
});

test("sortDevelopers: does not mutate the input array", () => {
  const input = [a, b, c];
  const copy = [...input];
  sortDevelopers(input, "pageViews", "desc");
  assert.deepEqual(input, copy);
});

test("filterDevelopersByStatus: NOT_VERIFIED matches every status except VERIFIED", () => {
  const verified = stat({ developerId: "v", verificationStatus: "VERIFIED" });
  const pending = stat({ developerId: "p", verificationStatus: "PENDING_VERIFICATION" });
  const none = stat({ developerId: "n", verificationStatus: null });

  const result = filterDevelopersByStatus([verified, pending, none], "NOT_VERIFIED");
  assert.deepEqual(result.map((d) => d.developerId).sort(), ["n", "p"]);
});

test("filterDevelopersByStatus: ALL (or null) returns everything unfiltered", () => {
  assert.equal(filterDevelopersByStatus([a, b, c], "ALL").length, 3);
  assert.equal(filterDevelopersByStatus([a, b, c], null).length, 3);
});

test("filterDevelopersByName: case-insensitive partial match", () => {
  const result = filterDevelopersByName([a, b, c], "a co");
  assert.deepEqual(result.map((d) => d.developerId), ["a"]);
});

test("filterDevelopersByName: empty query returns everything", () => {
  assert.equal(filterDevelopersByName([a, b, c], "").length, 3);
  assert.equal(filterDevelopersByName([a, b, c], "   ").length, 3);
});
