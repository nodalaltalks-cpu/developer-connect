import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchPublicDevelopers,
  getPublicDeveloperBySlug,
  listVerifiedDevelopers,
  listPublicGeographyOptions,
  getPublicHomepageData,
} from "../search-service.ts";
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

// --- listPublicGeographyOptions / getPublicHomepageData: the public
// filters must be fully data-driven — every option comes from an actual
// VERIFIED developer record, never a hardcoded list, and a location a
// Founder has never onboarded before must appear the moment its first
// developer is published, with no code change. ---

test("listPublicGeographyOptions: a published Mumbai developer makes India, Maharashtra, and Mumbai all appear, scoped correctly at each level", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Mumbai Co" });
  await verifyDeveloper(repos, developer.id, "https://mumbai.example");

  const topLevel = await listPublicGeographyOptions(repos);
  assert.deepEqual(topLevel.countries, ["India"], "country appears with zero prior configuration");

  const underIndia = await listPublicGeographyOptions(repos, { country: "India" });
  assert.deepEqual(underIndia.states, ["Maharashtra"], "state appears, scoped under its real country");

  const underState = await listPublicGeographyOptions(repos, { country: "India", state: "Maharashtra" });
  assert.deepEqual(underState.cities, ["Mumbai"], "city appears, scoped under its real country+state");
});

test("listPublicGeographyOptions: publishing a developer in a previously unseen city/country makes it appear automatically — no hardcoded list involved", async () => {
  const { repos, developer: mumbaiDev } = await setUpTestDeveloper({ displayName: "Test Mumbai Co" });
  await verifyDeveloper(repos, mumbaiDev.id, "https://mumbai.example");

  // Pune: a new city under an already-known country/state.
  const puneDev = await createDeveloper(repos.developers, {
    legalName: "Test Pune Developers Private Limited",
    displayName: "Test Pune Developers",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  });
  await verifyDeveloper(repos, puneDev.id, "https://pune.example");

  const underState = await listPublicGeographyOptions(repos, { country: "India", state: "Maharashtra" });
  assert.deepEqual(underState.cities, ["Mumbai", "Pune"]);

  // Dubai: an entirely new country and emirate/state, using the SAME
  // developer fields — proves no separate "Dubai architecture" is needed.
  const dubaiDev = await createDeveloper(repos.developers, {
    legalName: "Test Dubai Developers LLC",
    displayName: "Test Dubai Developers",
    city: "Dubai",
    state: "Dubai",
    country: "UAE",
  });
  await verifyDeveloper(repos, dubaiDev.id, "https://dubai.example");

  const topLevel = await listPublicGeographyOptions(repos);
  assert.deepEqual(topLevel.countries, ["India", "UAE"], "the new country appears with no code change");

  const underUae = await listPublicGeographyOptions(repos, { country: "UAE" });
  assert.deepEqual(underUae.states, ["Dubai"]);
  const dubaiCities = await listPublicGeographyOptions(repos, { country: "UAE", state: "Dubai" });
  assert.deepEqual(dubaiCities.cities, ["Dubai"]);

  // Abu Dhabi: a second emirate under the same country.
  const abuDhabiDev = await createDeveloper(repos.developers, {
    legalName: "Test Abu Dhabi Developers LLC",
    displayName: "Test Abu Dhabi Developers",
    city: "Abu Dhabi",
    state: "Abu Dhabi",
    country: "UAE",
  });
  await verifyDeveloper(repos, abuDhabiDev.id, "https://abudhabi.example");

  const underUaeAfter = await listPublicGeographyOptions(repos, { country: "UAE" });
  assert.deepEqual(underUaeAfter.states, ["Abu Dhabi", "Dubai"], "the new emirate appears alongside the existing one");
});

test("listPublicGeographyOptions: an unpublished developer's geography never appears as a public filter option", async () => {
  const { repos, developer: published } = await setUpTestDeveloper({ displayName: "Test Published Co" });
  await verifyDeveloper(repos, published.id, "https://published.example");

  const unpublished = await createDeveloper(repos.developers, {
    legalName: "Test Unpublished Developers Private Limited",
    displayName: "Test Unpublished Developers",
    city: "Jaipur",
    state: "Rajasthan",
    country: "India",
  });
  await submitWebsiteCandidate(repos, {
    developerId: unpublished.id,
    url: "https://unpublished.example",
    discoverySource: "MANUAL_SUBMISSION",
    actor: { actorType: "FOUNDER", actorId: "founder-1" },
  }); // left DISCOVERED — never approved

  const underIndia = await listPublicGeographyOptions(repos, { country: "India" });
  assert.ok(!underIndia.states.includes("Rajasthan"), "an unpublished developer's state must never appear publicly");

  const cities = await listPublicGeographyOptions(repos, { country: "India", state: "Rajasthan" });
  assert.deepEqual(cities.cities, [], "an unpublished developer's city must never appear publicly");
});

test("listPublicGeographyOptions: case-inconsistent entries (e.g. 'Mumbai' vs 'mumbai') never produce duplicate filter options", async () => {
  const { repos, developer: first } = await setUpTestDeveloper({
    displayName: "Test First Mumbai Co",
    legalName: "Test First Mumbai Co Private Limited",
  });
  await repos.developers.update(first.id, { city: "Mumbai", state: "Maharashtra", country: "India" });
  await verifyDeveloper(repos, first.id, "https://first.example");

  const second = await createDeveloper(repos.developers, {
    legalName: "Test Second mumbai Co Private Limited",
    displayName: "Test Second mumbai Co",
    city: "mumbai", // same real place, inconsistent casing
    state: "maharashtra",
    country: "india",
  });
  await verifyDeveloper(repos, second.id, "https://second.example");

  const topLevel = await listPublicGeographyOptions(repos);
  assert.equal(topLevel.countries.length, 1, "differently-cased country values collapse into one option");

  const underIndia = await listPublicGeographyOptions(repos, { country: topLevel.countries[0] });
  assert.equal(underIndia.states.length, 1, "differently-cased state values collapse into one option");

  const underState = await listPublicGeographyOptions(repos, {
    country: topLevel.countries[0],
    state: underIndia.states[0],
  });
  assert.equal(underState.cities.length, 1, "differently-cased city values collapse into one option");
});

test("getPublicHomepageData: no search and no filters returns every published developer", async () => {
  const { repos, developer: a } = await setUpTestDeveloper({ displayName: "Test Directory Co A" });
  await verifyDeveloper(repos, a.id, "https://a.example");
  const b = await createDeveloper(repos.developers, {
    legalName: "Test Directory Co B Private Limited",
    displayName: "Test Directory Co B",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  });
  await verifyDeveloper(repos, b.id, "https://b.example");

  const homepage = await getPublicHomepageData(repos);
  assert.equal(homepage.directory.length, 2, "no filters means every published developer is shown immediately");
});

test("getPublicHomepageData: search and geographic filters narrow the SAME dataset together, not two separate ones", async () => {
  const { repos, developer: mumbaiLodha } = await setUpTestDeveloper({
    displayName: "Test Lodha Mumbai",
    legalName: "Test Lodha Mumbai Private Limited",
  });
  await verifyDeveloper(repos, mumbaiLodha.id, "https://lodha-mumbai.example");

  const puneLodha = await createDeveloper(repos.developers, {
    legalName: "Test Lodha Pune Private Limited",
    displayName: "Test Lodha Pune",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  });
  await verifyDeveloper(repos, puneLodha.id, "https://lodha-pune.example");

  const combined = await getPublicHomepageData(repos, {
    query: "Lodha",
    country: "India",
    state: "Maharashtra",
    city: "Mumbai",
  });
  assert.deepEqual(combined.directory.map((d) => d.id), [mumbaiLodha.id]);

  const geoOnly = await getPublicHomepageData(repos, { city: "Pune" });
  assert.deepEqual(geoOnly.directory.map((d) => d.id), [puneLodha.id]);
});

test("getPublicHomepageData: 'citiesCovered' counts distinct real markets, never inflated by casing duplicates", async () => {
  const { repos, developer: a } = await setUpTestDeveloper({ displayName: "Test Market Co A" });
  await verifyDeveloper(repos, a.id, "https://a.example");
  const b = await createDeveloper(repos.developers, {
    legalName: "Test Market Co B Private Limited",
    displayName: "Test Market Co B",
    city: "mumbai",
    state: "maharashtra",
    country: "india",
  });
  await verifyDeveloper(repos, b.id, "https://b.example");

  const homepage = await getPublicHomepageData(repos);
  assert.equal(homepage.stats.citiesCovered, 1, "the same real market must not be counted twice due to casing");
});
