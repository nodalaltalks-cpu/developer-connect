import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPublicDevelopers, getPublicDeveloperBySlug, listVerifiedDevelopers } from "../search-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveCandidate, markReadyForReview } from "../verification-service.ts";
import { createDeveloper } from "../developer-service.ts";
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

test("listVerifiedDevelopers: returns nothing when no developer has a verified website", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Unlisted Co" });
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  }); // left at DISCOVERED — never approved

  assert.deepEqual(await listVerifiedDevelopers(repos), []);
});

test("listVerifiedDevelopers: lists every verified developer, alphabetically by display name, never an unverified one", async () => {
  const { repos, developer: zebra } = await setUpTestDeveloper({
    legalName: "Test Zebra Developers Private Limited",
    displayName: "Zebra Developers",
  });
  await verifyDeveloper(repos, zebra.id, "https://zebra.example");

  const alpha = await createDeveloper(repos.developers, {
    legalName: "Test Alpha Developers Private Limited",
    displayName: "Alpha Developers",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  await verifyDeveloper(repos, alpha.id, "https://alpha.example");

  // A third developer with no verified website at all — must never appear.
  await setUpTestDeveloper({
    legalName: "Test Hidden Developers Private Limited",
    displayName: "Hidden Developers",
  });

  const results = await listVerifiedDevelopers(repos);
  assert.deepEqual(
    results.map((d) => d.displayName),
    ["Alpha Developers", "Zebra Developers"],
  );
  assert.ok(results.every((d) => d.officialWebsite !== null));
});

test("listVerifiedDevelopers: never exposes internal verification fields", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await listVerifiedDevelopers(repos);
  const serialized = JSON.stringify(results);
  assert.ok(!serialized.includes("confidenceScore"));
  assert.ok(!serialized.includes("reviewedBy"));
  assert.ok(!serialized.includes(founder.actorId));
});

test("listVerifiedDevelopers: an INACTIVE developer never appears, even with a verified candidate", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Deactivated Co" });
  await verifyDeveloper(repos, developer.id, "https://example.com");
  await repos.developers.update(developer.id, { status: "INACTIVE" });

  assert.deepEqual(await listVerifiedDevelopers(repos), []);
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

// --- searchPublicDevelopers + geography: search and filters must refine
// each other, not ignore one another (the "search + filter gap" fix) ---

test("searchPublicDevelopers: a geo filter narrows a name match to only developers in that location", async () => {
  const { repos, developer: mumbaiOne } = await setUpTestDeveloper({
    legalName: "Test Lodha Mumbai Private Limited",
    displayName: "Test Lodha Mumbai",
  });
  await verifyDeveloper(repos, mumbaiOne.id, "https://lodha-mumbai.example");

  const puneOne = await createDeveloper(repos.developers, {
    legalName: "Test Lodha Pune Private Limited",
    displayName: "Test Lodha Pune",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  });
  await verifyDeveloper(repos, puneOne.id, "https://lodha-pune.example");

  const unfiltered = await searchPublicDevelopers(repos, "Lodha");
  assert.equal(unfiltered.length, 2, "without a geo filter, both matches are returned");

  const mumbaiOnly = await searchPublicDevelopers(repos, "Lodha", { city: "Mumbai" });
  assert.deepEqual(mumbaiOnly.map((d) => d.id), [mumbaiOne.id]);

  const puneOnly = await searchPublicDevelopers(repos, "Lodha", { city: "Pune" });
  assert.deepEqual(puneOnly.map((d) => d.id), [puneOne.id]);
});

test("searchPublicDevelopers: geo filter matching is case-insensitive, same as the geography select options", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "Developer", { city: "mumbai", state: "MAHARASHTRA" });
  assert.equal(results.length, 1);
});

test("searchPublicDevelopers: a geo filter matching no developer returns nothing, even if the name matches", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  const results = await searchPublicDevelopers(repos, "Developer", { city: "Thane" });
  assert.deepEqual(results, []);
});

test("searchPublicDevelopers: country/state/city combine as an AND, matching the directory's own filter semantics", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Developer One" });
  await verifyDeveloper(repos, developer.id, "https://example.com");

  assert.equal(
    (await searchPublicDevelopers(repos, "Developer", { country: "India", state: "Maharashtra", city: "Mumbai" }))
      .length,
    1,
  );
  assert.deepEqual(
    await searchPublicDevelopers(repos, "Developer", { country: "India", state: "Maharashtra", city: "Pune" }),
    [],
  );
});
