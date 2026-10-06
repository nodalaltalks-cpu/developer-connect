import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicDeveloperProfile , internalSearchDomain } from "../public-view.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveCandidate, markReadyForReview } from "../verification-service.ts";
import { setUpTestDeveloper } from "./test-helpers.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

test("public view: a developer with no verified candidate exposes no official website", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  const profile = toPublicDeveloperProfile(developer, null);
  assert.equal(profile.officialWebsite, null);
});

test("public view: refuses to expose a candidate that is not VERIFIED, even if one is passed in by mistake", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  assert.throws(() => toPublicDeveloperProfile(developer, candidate));
});

test("public view: a VERIFIED candidate is exposed, but without internal verification fields", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
    initialEvidence: [{ evidenceType: "MANUAL_CONFIRMATION", detail: "Confirmed by phone" }],
  });
  await markReadyForReview(repos, candidate.id, founder);
  const verified = await approveCandidate(repos, candidate.id, founder, "Confirmed");

  const profile = toPublicDeveloperProfile(developer, verified);

  // The public profile proves the website is VERIFIED, but never carries its URL or domain.
  assert.ok(profile.officialWebsite?.verifiedAt instanceof Date);
  assert.deepEqual(Object.keys(profile.officialWebsite ?? {}), ["verifiedAt"]);
  assert.ok(!JSON.stringify(profile).includes("example.com"));
  assert.ok(!("url" in (profile.officialWebsite ?? {})));
  assert.ok(!("canonicalDomain" in (profile.officialWebsite ?? {})));
  // ...while server-side search can still match on the domain without it being serialisable.
  assert.equal(internalSearchDomain(profile), "example.com");
  assert.ok(!Object.keys(profile).includes("searchDomain"));
  assert.ok(!JSON.stringify(structuredClone(profile)).includes("example.com"));
  // legalName is surfaced in the public detail page as secondary/progressive
  // disclosure info — must keep passing through toPublicDeveloperProfile.
  assert.equal(profile.legalName, developer.legalName);
  assert.equal(profile.displayName, developer.displayName);

  const serialized = JSON.stringify(profile);
  assert.ok(!serialized.includes("confidenceScore"));
  assert.ok(!serialized.includes("reviewedBy"));
  assert.ok(!serialized.includes("evidence"));
  assert.ok(!serialized.includes(founder.actorId));
});
