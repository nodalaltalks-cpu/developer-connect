import { test } from "node:test";
import assert from "node:assert/strict";
import { submitWebsiteCandidate, addEvidence } from "../candidate-service.ts";
import { rejectCandidate } from "../verification-service.ts";
import { DuplicateCandidateError, NotFoundError } from "../errors.ts";
import { setUpTestDeveloper } from "./test-helpers.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

test("candidate-service: a developer can have multiple website candidates over time", async () => {
  const { repos, developer } = await setUpTestDeveloper();

  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://new-domain.example",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  const all = await repos.candidates.listByDeveloper(developer.id);
  assert.equal(all.length, 2);
});

test("candidate-service: submitting the same live domain+path twice is rejected as a duplicate", async () => {
  const { repos, developer } = await setUpTestDeveloper();

  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com/",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  await assert.rejects(
    () =>
      submitWebsiteCandidate(repos, {
        developerId: developer.id,
        url: "https://www.example.com", // same canonical domain + path, different formatting
        discoverySource: "AGENT_CRAWL",
        actor: { actorType: "AGENT", actorId: "agent-1" },
      }),
    DuplicateCandidateError,
  );
});

test("candidate-service: resubmitting a previously rejected domain is allowed as a new historical record", async () => {
  const { repos, developer } = await setUpTestDeveloper();

  const first = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await rejectCandidate(repos, first.id, founder, "Not the developer's site");

  const second = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  assert.notEqual(second.id, first.id);
  const all = await repos.candidates.listByDeveloper(developer.id);
  assert.equal(all.length, 2);
});

test("candidate-service: a known property portal is automatically rejected, never left pending", async () => {
  const { repos, developer } = await setUpTestDeveloper();

  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://www.99acres.com/some-listing",
    discoverySource: "SEARCH_ENGINE",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  assert.equal(candidate.verificationStatus, "REJECTED");
  assert.ok(candidate.rejectionReason?.includes("99acres.com"));
});

test("candidate-service: a social media profile is never treated as an official website", async () => {
  const { repos, developer } = await setUpTestDeveloper();

  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://www.instagram.com/somedeveloper",
    discoverySource: "SEARCH_ENGINE",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  assert.equal(candidate.verificationStatus, "REJECTED");
});

test("candidate-service: submitting for a nonexistent developer fails", async () => {
  const { repos } = await setUpTestDeveloper();

  await assert.rejects(
    () =>
      submitWebsiteCandidate(repos, {
        developerId: "does-not-exist",
        url: "https://example.com",
        discoverySource: "MANUAL_SUBMISSION",
        actor: founder,
      }),
    NotFoundError,
  );
});

test("candidate-service: attaching evidence to a nonexistent candidate fails (ownership validation)", async () => {
  const { repos } = await setUpTestDeveloper();

  await assert.rejects(
    () =>
      addEvidence(repos, "does-not-exist", [
        { evidenceType: "MANUAL_CONFIRMATION", detail: "Confirmed by phone" },
      ]),
    NotFoundError,
  );
});

test("candidate-service: evidence attaches to the correct candidate and recomputes its confidence score", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  assert.equal(candidate.confidenceScore, 0);

  const added = await addEvidence(repos, candidate.id, [
    { evidenceType: "MANUAL_CONFIRMATION", detail: "Confirmed by phone", sourceUrl: "https://mca.gov.in/example" },
  ]);

  assert.equal(added.length, 1);
  assert.equal(added[0].websiteCandidateId, candidate.id);

  const updated = await repos.candidates.getById(candidate.id);
  assert.ok(updated && updated.confidenceScore > 0);
});
