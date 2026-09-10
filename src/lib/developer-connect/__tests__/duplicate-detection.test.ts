import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper, findLikelyDuplicateDeveloper } from "../developer-service.ts";

test("duplicate-detection: an exact display-name match (after normalization) is flagged", async () => {
  const repos = createInMemoryRepositories();
  const existing = await createDeveloper(repos.developers, {
    legalName: "Test Duplicate Private Limited",
    displayName: "Test Duplicate Developers",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const match = await findLikelyDuplicateDeveloper(repos.developers, {
    legalName: "Some Other Legal Name Pvt Ltd",
    displayName: "  test   DUPLICATE developers  ", // different case + spacing
  });

  assert.equal(match?.id, existing.id);
});

test("duplicate-detection: an exact legal-name match (after normalization) is flagged even if display name differs", async () => {
  const repos = createInMemoryRepositories();
  const existing = await createDeveloper(repos.developers, {
    legalName: "Test Duplicate Legal Entity Private Limited",
    displayName: "Test Duplicate Brand",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const match = await findLikelyDuplicateDeveloper(repos.developers, {
    legalName: "Test Duplicate Legal Entity Private Limited",
    displayName: "A Totally Different Marketing Name",
  });

  assert.equal(match?.id, existing.id);
});

test("duplicate-detection: a genuinely different developer is not flagged", async () => {
  const repos = createInMemoryRepositories();
  await createDeveloper(repos.developers, {
    legalName: "Test Duplicate Private Limited",
    displayName: "Test Duplicate Developers",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const match = await findLikelyDuplicateDeveloper(repos.developers, {
    legalName: "Completely Unrelated Private Limited",
    displayName: "Completely Unrelated Developers",
  });

  assert.equal(match, null);
});

test("duplicate-detection: documented limitation — differently-worded names for the same real company are NOT caught", async () => {
  const repos = createInMemoryRepositories();
  await createDeveloper(repos.developers, {
    legalName: "Example Group Private Limited",
    displayName: "Example Group",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  // A human would recognize these as likely the same company; this
  // deterministic, non-fuzzy check deliberately does not.
  const match = await findLikelyDuplicateDeveloper(repos.developers, {
    legalName: "Example Developers Private Limited",
    displayName: "Example Developers",
  });

  assert.equal(match, null);
});

test("duplicate-detection: does not block creation itself — createDeveloper's existing same-name behavior is unchanged", async () => {
  const repos = createInMemoryRepositories();
  const first = await createDeveloper(repos.developers, {
    legalName: "Test Developer Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  const second = await createDeveloper(repos.developers, {
    legalName: "Test Developer (Another Entity) Private Limited",
    displayName: "Test Developer",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  assert.notEqual(first.id, second.id);
  assert.equal(second.slug, "test-developer-2");
});
