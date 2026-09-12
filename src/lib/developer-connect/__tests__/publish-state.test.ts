import { test } from "node:test";
import assert from "node:assert/strict";
import { findPendingCandidate } from "../publish-state.ts";
import type { WebsiteCandidate, VerificationStatus } from "../types.ts";

function candidate(overrides: Partial<WebsiteCandidate> & { id: string; verificationStatus: VerificationStatus }): WebsiteCandidate {
  return {
    developerId: "dev-1",
    url: `https://www.${overrides.id}.example`,
    canonicalDomain: `${overrides.id}.example`,
    discoverySource: "MANUAL_SUBMISSION",
    confidenceScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("findPendingCandidate: returns null when the verified candidate is the only one", () => {
  const verified = candidate({ id: "verified", verificationStatus: "VERIFIED" });
  assert.equal(findPendingCandidate([verified], verified.id), null);
});

test("findPendingCandidate: finds a newly submitted DISCOVERED candidate alongside the verified one", () => {
  const verified = candidate({ id: "old", verificationStatus: "VERIFIED" });
  const discovered = candidate({ id: "new", verificationStatus: "DISCOVERED" });
  const result = findPendingCandidate([verified, discovered], verified.id);
  assert.equal(result?.id, "new");
});

test("findPendingCandidate: finds a PENDING_VERIFICATION or NEEDS_REVERIFICATION candidate too", () => {
  const verified = candidate({ id: "old", verificationStatus: "VERIFIED" });
  const pending = candidate({ id: "pending", verificationStatus: "PENDING_VERIFICATION" });
  assert.equal(findPendingCandidate([verified, pending], verified.id)?.id, "pending");

  const needsReverify = candidate({ id: "flagged", verificationStatus: "NEEDS_REVERIFICATION" });
  assert.equal(findPendingCandidate([verified, needsReverify], verified.id)?.id, "flagged");
});

test("findPendingCandidate: a REJECTED or INACTIVE candidate is resolved, never reported as pending", () => {
  const verified = candidate({ id: "old", verificationStatus: "VERIFIED" });
  const rejected = candidate({ id: "rejected", verificationStatus: "REJECTED" });
  const inactive = candidate({ id: "inactive", verificationStatus: "INACTIVE" });
  assert.equal(findPendingCandidate([verified, rejected, inactive], verified.id), null);
});

test("findPendingCandidate: never reports the verified candidate itself as pending", () => {
  const verified = candidate({ id: "only", verificationStatus: "VERIFIED" });
  assert.equal(findPendingCandidate([verified], verified.id), null);
});
