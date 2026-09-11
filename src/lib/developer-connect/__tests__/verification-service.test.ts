import { test } from "node:test";
import assert from "node:assert/strict";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import {
  approveCandidate,
  approveAndPublishCandidate,
  rejectCandidate,
  markReadyForReview,
} from "../verification-service.ts";
import { searchPublicDevelopers } from "../search-service.ts";
import {
  UnauthorizedVerificationActionError,
  CrossDeveloperDomainConflictError,
  InvalidTransitionError,
} from "../errors.ts";
import { createDeveloper } from "../developer-service.ts";
import { setUpTestDeveloper } from "./test-helpers.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };
const agent = { actorType: "AGENT" as const, actorId: "agent-1" };
const system = { actorType: "SYSTEM" as const, actorId: "reverification-check" };

async function submitAndQueue(repos: Awaited<ReturnType<typeof setUpTestDeveloper>>["repos"], developerId: string, url: string) {
  const candidate = await submitWebsiteCandidate(repos, {
    developerId,
    url,
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  return markReadyForReview(repos, candidate.id, founder);
}

test("verification: a high confidence score alone cannot reach VERIFIED without an explicit founder action", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
    initialEvidence: [
      { evidenceType: "MANUAL_CONFIRMATION", detail: "Confirmed by phone" },
      { evidenceType: "REGULATORY_FILING_REFERENCE", detail: "MahaRERA filing" },
    ],
  });

  assert.ok(candidate.confidenceScore >= 0.7);
  assert.equal(candidate.verificationStatus, "DISCOVERED");
});

test("verification: only a FOUNDER actor may approve a candidate", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitAndQueue(repos, developer.id, "https://example.com");

  await assert.rejects(
    () => approveCandidate(repos, candidate.id, agent, "looks fine"),
    UnauthorizedVerificationActionError,
  );
  await assert.rejects(
    () => approveCandidate(repos, candidate.id, system, "looks fine"),
    UnauthorizedVerificationActionError,
  );

  const stillPending = await repos.candidates.getById(candidate.id);
  assert.equal(stillPending?.verificationStatus, "PENDING_VERIFICATION");
});

test("automation safety boundary: a candidate discovered/proposed by SYSTEM or AGENT never becomes publicly visible until a FOUNDER explicitly approves it", async () => {
  const { repos, developer } = await setUpTestDeveloper({ displayName: "Test Automation Boundary Co" });

  // Automation is allowed to discover and propose — creating a candidate
  // itself never requires a FOUNDER actor.
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "AGENT_CRAWL",
    actor: agent,
  });
  assert.equal(candidate.verificationStatus, "DISCOVERED");

  let results = await searchPublicDevelopers(repos, "Test Automation Boundary Co");
  assert.deepEqual(results, [], "an automation-discovered candidate must not be public before review");

  await markReadyForReview(repos, candidate.id, founder);

  // Automation/system actors cannot grant the final approval, no matter
  // how confident or "ready" the candidate looks.
  await assert.rejects(() => approveCandidate(repos, candidate.id, agent, "auto-confirmed"), UnauthorizedVerificationActionError);
  await assert.rejects(() => approveCandidate(repos, candidate.id, system, "auto-confirmed"), UnauthorizedVerificationActionError);

  results = await searchPublicDevelopers(repos, "Test Automation Boundary Co");
  assert.deepEqual(results, [], "still not public after a rejected automation approval attempt");

  await approveCandidate(repos, candidate.id, founder, "Confirmed via WHOIS");

  results = await searchPublicDevelopers(repos, "Test Automation Boundary Co");
  assert.equal(results.length, 1, "only a real FOUNDER approval makes it public");
});

test("verification: founder approval marks the candidate VERIFIED with reviewer metadata", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitAndQueue(repos, developer.id, "https://example.com");

  const verified = await approveCandidate(repos, candidate.id, founder, "Confirmed via WHOIS + phone call");

  assert.equal(verified.verificationStatus, "VERIFIED");
  assert.equal(verified.reviewedBy, founder.actorId);
  assert.ok(verified.reviewedAt);
});

test("verification: only one candidate per developer can be VERIFIED at a time", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const first = await submitAndQueue(repos, developer.id, "https://old-site.example");
  await approveCandidate(repos, first.id, founder, "initial verification");

  const second = await submitAndQueue(repos, developer.id, "https://new-site.example");
  const verifiedSecond = await approveCandidate(repos, second.id, founder, "developer moved domains");

  const refreshedFirst = await repos.candidates.getById(first.id);
  assert.equal(refreshedFirst?.verificationStatus, "INACTIVE");
  assert.equal(verifiedSecond.verificationStatus, "VERIFIED");

  const currentlyVerified = await repos.candidates.getVerifiedForDeveloper(developer.id);
  assert.equal(currentlyVerified?.id, second.id);
});

test("verification: rejection is recorded with a reason and only a FOUNDER may reject", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitAndQueue(repos, developer.id, "https://example.com");

  await assert.rejects(() => rejectCandidate(repos, candidate.id, agent, "not official"));

  const rejected = await rejectCandidate(repos, candidate.id, founder, "Confirmed to be a broker's site");
  assert.equal(rejected.verificationStatus, "REJECTED");
  assert.equal(rejected.rejectionReason, "Confirmed to be a broker's site");
});

test("verification: the same domain cannot be VERIFIED for two different developers at once", async () => {
  const { repos, developer: developerA } = await setUpTestDeveloper({
    legalName: "Test Developer A Private Limited",
    displayName: "Test Developer A",
  });
  const developerB = await createDeveloper(repos.developers, {
    legalName: "Test Developer B Private Limited",
    displayName: "Test Developer B",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const candidateA = await submitAndQueue(repos, developerA.id, "https://shared-domain.example");
  await approveCandidate(repos, candidateA.id, founder, "Confirmed for developer A");

  const candidateB = await submitAndQueue(repos, developerB.id, "https://shared-domain.example");

  await assert.rejects(
    () => approveCandidate(repos, candidateB.id, founder, "Looked fine at a glance"),
    CrossDeveloperDomainConflictError,
  );

  // Nothing changed on either side: developer A keeps its verified
  // candidate, developer B's candidate is still pending, not silently
  // verified.
  const stillVerifiedA = await repos.candidates.getVerifiedForDeveloper(developerA.id);
  assert.equal(stillVerifiedA?.id, candidateA.id);
  const refreshedB = await repos.candidates.getById(candidateB.id);
  assert.equal(refreshedB?.verificationStatus, "PENDING_VERIFICATION");
});

test("verification: re-verifying the SAME developer at the same domain (a legitimate re-approval) is unaffected by the cross-developer guard", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const first = await submitAndQueue(repos, developer.id, "https://same-owner.example");
  await approveCandidate(repos, first.id, founder, "initial verification");

  // A second candidate at the exact same domain for the SAME developer
  // (e.g. re-submitted after some other change) must still be approvable
  // — the cross-developer guard only blocks a DIFFERENT developer.
  const second = await submitAndQueue(repos, developer.id, "https://same-owner.example/about");
  const verified = await approveCandidate(repos, second.id, founder, "re-confirmed");

  assert.equal(verified.verificationStatus, "VERIFIED");
});

test("approveAndPublishCandidate: a brand-new DISCOVERED candidate can be approved in one call, reproducing and fixing the original Approve failure", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  assert.equal(candidate.verificationStatus, "DISCOVERED");

  // Before the fix, calling approveCandidate directly on a DISCOVERED
  // candidate is exactly what threw InvalidTransitionError in production.
  await assert.rejects(() => approveCandidate(repos, candidate.id, founder, "premature"), InvalidTransitionError);

  const published = await approveAndPublishCandidate(repos, candidate.id, founder, "Confirmed via WHOIS");
  assert.equal(published.verificationStatus, "VERIFIED");

  const results = await searchPublicDevelopers(repos, developer.displayName);
  assert.equal(results.length, 1, "publishing a DISCOVERED candidate in one action must make it public");

  // Both real transitions are preserved in history — nothing is skipped
  // or fabricated, the intermediate step is just no longer a separate
  // founder-facing click.
  const history = await repos.events.listByCandidate(candidate.id);
  const transitions = history.map((e) => [e.previousStatus, e.newStatus]);
  assert.deepEqual(transitions, [
    [null, "DISCOVERED"],
    ["DISCOVERED", "PENDING_VERIFICATION"],
    ["PENDING_VERIFICATION", "VERIFIED"],
  ]);
});

test("approveAndPublishCandidate: only a FOUNDER may use it, exactly like approveCandidate", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidate.id, agent, "auto-confirmed"),
    UnauthorizedVerificationActionError,
  );

  const stillDiscovered = await repos.candidates.getById(candidate.id);
  assert.equal(stillDiscovered?.verificationStatus, "DISCOVERED");
});

test("approveAndPublishCandidate: approving an already-VERIFIED candidate fails with a specific, real error rather than silently succeeding", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await approveAndPublishCandidate(repos, candidate.id, founder, "first approval");

  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidate.id, founder, "second approval"),
    InvalidTransitionError,
  );
});

test("approveAndPublishCandidate: approving a REJECTED candidate fails — rejection is not silently overridden", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: "https://example.com",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await rejectCandidate(repos, candidate.id, founder, "Not the real site");

  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidate.id, founder, "changed my mind"),
    InvalidTransitionError,
  );
});

test("approveAndPublishCandidate: still enforces the cross-developer domain conflict guard for a DISCOVERED candidate", async () => {
  const { repos, developer: developerA } = await setUpTestDeveloper({
    legalName: "Test Developer A Private Limited",
    displayName: "Test Developer A",
  });
  const developerB = await createDeveloper(repos.developers, {
    legalName: "Test Developer B Private Limited",
    displayName: "Test Developer B",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });

  const candidateA = await submitWebsiteCandidate(repos, {
    developerId: developerA.id,
    url: "https://shared-domain-2.example",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await approveAndPublishCandidate(repos, candidateA.id, founder, "Confirmed for developer A");

  const candidateB = await submitWebsiteCandidate(repos, {
    developerId: developerB.id,
    url: "https://shared-domain-2.example",
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });

  await assert.rejects(
    () => approveAndPublishCandidate(repos, candidateB.id, founder, "Looked fine at a glance"),
    CrossDeveloperDomainConflictError,
  );

  const refreshedB = await repos.candidates.getById(candidateB.id);
  assert.notEqual(refreshedB?.verificationStatus, "VERIFIED", "the failed approval must never leave B silently verified");
  const stillVerifiedA = await repos.candidates.getVerifiedForDeveloper(developerA.id);
  assert.equal(stillVerifiedA?.id, candidateA.id, "developer A's real verification is untouched by B's failed attempt");
});

test("verification: every status transition is recorded as an immutable history entry", async () => {
  const { repos, developer } = await setUpTestDeveloper();
  const candidate = await submitAndQueue(repos, developer.id, "https://example.com");
  await approveCandidate(repos, candidate.id, founder, "verified");

  const history = await repos.events.listByCandidate(candidate.id);
  const transitions = history.map((e) => [e.previousStatus, e.newStatus]);

  assert.deepEqual(transitions, [
    [null, "DISCOVERED"],
    ["DISCOVERED", "PENDING_VERIFICATION"],
    ["PENDING_VERIFICATION", "VERIFIED"],
  ]);
  assert.ok(history.every((e) => e.actorType && e.actorId && e.createdAt instanceof Date));
});
