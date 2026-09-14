import { test } from "node:test";
import assert from "node:assert/strict";
import { submitWebsiteCandidate, addEvidence, updateCandidateUrl } from "../candidate-service.ts";
import { rejectCandidate, approveAndPublishCandidate } from "../verification-service.ts";
import { DuplicateCandidateError, NotFoundError, UnauthorizedVerificationActionError } from "../errors.ts";
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

// --- updateCandidateUrl: Founder "Edit URL" regression coverage -----------
// Reproduces the exact bug described in the review task: a save must
// return (and a re-fetch must show) the ACTUAL persisted value, not a
// stale one. These assert against the real repository read, not just the
// function's return value, so a bug in a repository's `update()` that
// returned a stale/mismatched row would still be caught.

test("updateCandidateUrl: the saved URL persists — both in the immediate return value and on a fresh re-read", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  const saved = await updateCandidateUrl(repos, candidate.id, "https://correct-domain.example", founder);
  assert.equal(saved.url, "https://correct-domain.example/");
  assert.equal(saved.canonicalDomain, "correct-domain.example");

  // Simulates "Founder refreshes the page and opens Review again."
  const reloaded = await repos.candidates.getById(candidate.id);
  assert.equal(reloaded?.url, "https://correct-domain.example/");
  assert.equal(reloaded?.canonicalDomain, "correct-domain.example");
});

test("updateCandidateUrl: editing the URL never changes verificationStatus — no accidental verify/publish/reset", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });
  assert.equal(candidate.verificationStatus, "DISCOVERED");

  const saved = await updateCandidateUrl(repos, candidate.id, "https://correct-domain.example", founder);
  assert.equal(saved.verificationStatus, "DISCOVERED");
});

test("updateCandidateUrl: works the same way for an already-published (VERIFIED) candidate — status stays VERIFIED", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await approveAndPublishCandidate(repos, candidate.id, founder, "Confirmed official site");

  const saved = await updateCandidateUrl(repos, candidate.id, "https://corrected-domain.example", founder);
  assert.equal(saved.verificationStatus, "VERIFIED");
  assert.equal(saved.canonicalDomain, "corrected-domain.example");
});

test("updateCandidateUrl: records a history event so the correction is traceable", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  await updateCandidateUrl(repos, candidate.id, "https://correct-domain.example", founder);

  const history = await repos.events.listByCandidate(candidate.id);
  const urlEvent = history.find((e) => e.reason.includes("URL corrected"));
  assert.ok(urlEvent, "expected a verification event recording the URL correction");
  assert.equal(urlEvent?.previousStatus, "DISCOVERED");
  assert.equal(urlEvent?.newStatus, "DISCOVERED");
});

test("updateCandidateUrl: saving the exact same URL again is a no-op (no duplicate history event)", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  const before = await repos.events.listByCandidate(candidate.id);
  const saved = await updateCandidateUrl(repos, candidate.id, "https://example.com/", founder);
  const after = await repos.events.listByCandidate(candidate.id);

  assert.equal(saved.url, "https://example.com/");
  assert.equal(after.length, before.length);
});

test("updateCandidateUrl: a non-FOUNDER actor is rejected", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  await assert.rejects(
    () => updateCandidateUrl(repos, candidate.id, "https://correct-domain.example", { actorType: "AGENT", actorId: "agent-1" }),
    UnauthorizedVerificationActionError,
  );
});

test("updateCandidateUrl: editing to a domain+path already tracked for this developer is rejected as a duplicate", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://taken-domain.example/",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://old-domain.example/",
    discoverySource: "AGENT_CRAWL",
    actor: { actorType: "AGENT", actorId: "agent-1" },
  });

  await assert.rejects(
    () => updateCandidateUrl(repos, candidate.id, "https://taken-domain.example/", founder),
    DuplicateCandidateError,
  );
});
