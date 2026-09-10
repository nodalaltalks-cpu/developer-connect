import { test } from "node:test";
import assert from "node:assert/strict";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import {
  approveCandidate,
  rejectCandidate,
  markReadyForReview,
} from "../verification-service.ts";
import { UnauthorizedVerificationActionError, CrossDeveloperDomainConflictError } from "../errors.ts";
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
