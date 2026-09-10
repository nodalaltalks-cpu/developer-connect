import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPublicDevelopers, getPublicDeveloperBySlug } from "../search-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveCandidate, markReadyForReview } from "../verification-service.ts";
import { setUpTestDeveloper } from "./test-helpers.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

async function verifyDeveloper(repos: Awaited<ReturnType<typeof setUpTestDeveloper>>["repos"], developerId: string, url: string) {
  const candidate = await submitWebsiteCandidate(repos, {
    developerId,
    url,
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await markReadyForReview(repos, candidate.id, founder);
  return approveCandidate(repos, candidate.id, founder, "Confirmed");
}

test("search-service: finds a verified developer by partial, case-insensitive name match", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "developer ONE");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, developer.id);
});

test("search-service: a developer without a verified website never appears in search results", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Unverified Co" });
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  }); // left at DISCOVERED — never approved

  const results = await searchPublicDevelopers(repos, "Unverified");
  assert.deepEqual(results, []);
});

test("search-service: returns nothing for a query that matches no developer", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "Nonexistent Name Xyz");
  assert.deepEqual(results, []);
});

test("search-service: extra/irregular whitespace in the query still matches", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "   test    developer   ");
  assert.equal(results.length, 1);
});

test("search-service: an empty or whitespace-only query returns no results, not everything", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await verifyDeveloper(repos, developer.id, "https://example.com");

  assert.deepEqual(await searchPublicDevelopers(repos, ""), []);
  assert.deepEqual(await searchPublicDevelopers(repos, "   "), []);
});

test("search-service: search results never expose internal verification fields", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "Developer One");
  const serialized = JSON.stringify(results);
  assert.ok(!serialized.includes("confidenceScore"));
  assert.ok(!serialized.includes("reviewedBy"));
  assert.ok(!serialized.includes(founder.actorId));
});

test("getPublicDeveloperBySlug: returns null for a slug that doesn't exist", async () => {
  const { repos } = await setUpTestDeveloper();
  assert.equal(await getPublicDeveloperBySlug(repos, "does-not-exist"), null);
});

test("getPublicDeveloperBySlug: returns null for an INACTIVE developer (reads as not-found publicly)", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await repos.developers.update(developer.id, { status: "INACTIVE" });

  assert.equal(await getPublicDeveloperBySlug(repos, developer.slug), null);
});

test("getPublicDeveloperBySlug: an ACTIVE developer with no verified website is still returned, with officialWebsite null", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  const profile = await getPublicDeveloperBySlug(repos, developer.slug);
  assert.ok(profile);
  assert.equal(profile.officialWebsite, null);
});

test("getPublicDeveloperBySlug: a verified developer includes its official website", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const profile = await getPublicDeveloperBySlug(repos, developer.slug);
  assert.equal(profile?.officialWebsite?.canonicalDomain, "example.com");
});
