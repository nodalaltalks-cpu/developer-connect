import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicDeveloperProfile } from "../public-view.ts";
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

  assert.equal(profile.officialWebsite?.url, "https://example.com/");
  assert.equal(profile.officialWebsite?.canonicalDomain, "example.com");
  assert.ok(profile.officialWebsite?.verifiedAt instanceof Date);

  const serialized = JSON.stringify(profile);
  assert.ok(!serialized.includes("confidenceScore"));
  assert.ok(!serialized.includes("reviewedBy"));
  assert.ok(!serialized.includes("evidence"));
  assert.ok(!serialized.includes(founder.actorId));
});
