import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, makeUniqueSlug } from "../slug.ts";

test("slugify: produces deterministic, URL-safe slugs", () => {
  assert.equal(slugify("Lodha Group"), "lodha-group");
  assert.equal(slugify("Oberoi Realty"), "oberoi-realty");
  assert.equal(slugify("K & K Developers"), "k-and-k-developers");
  assert.equal(slugify("  Extra   Spaces  "), "extra-spaces");
});

test("slugify: is deterministic for the same input", () => {
  assert.equal(slugify("Test Developer One"), slugify("Test Developer One"));
});

test("makeUniqueSlug: returns the base slug when it does not already exist", async () => {
  const slug = await makeUniqueSlug("Test Developer One", () => false);
  assert.equal(slug, "test-developer-one");
});

test("makeUniqueSlug: appends a numeric suffix on collision, and keeps incrementing until free", async () => {
  const taken = new Set(["test-developer-one", "test-developer-one-2", "test-developer-one-3"]);
  const slug = await makeUniqueSlug("Test Developer One", (candidate) => taken.has(candidate));
  assert.equal(slug, "test-developer-one-4");
});

test("makeUniqueSlug: rejects a name that produces an empty slug", async () => {
  await assert.rejects(() => makeUniqueSlug("!!!", () => false));
});
