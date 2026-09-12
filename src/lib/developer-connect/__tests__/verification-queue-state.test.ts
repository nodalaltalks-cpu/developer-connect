import { test } from "node:test";
import assert from "node:assert/strict";
import { isPendingVerificationStatus, PENDING_VERIFICATION_STATUSES } from "../verification-queue-state.ts";
import type { VerificationStatus } from "../types.ts";

const ALL_STATUSES: VerificationStatus[] = [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "NEEDS_REVERIFICATION",
  "INACTIVE",
];

test("isPendingVerificationStatus: true for exactly the three statuses the verification queue lists", () => {
  assert.equal(isPendingVerificationStatus("DISCOVERED"), true);
  assert.equal(isPendingVerificationStatus("PENDING_VERIFICATION"), true);
  assert.equal(isPendingVerificationStatus("NEEDS_REVERIFICATION"), true);
});

test("isPendingVerificationStatus: false for the three terminal/decided statuses — these must leave the queue", () => {
  assert.equal(isPendingVerificationStatus("VERIFIED"), false);
  assert.equal(isPendingVerificationStatus("REJECTED"), false);
  assert.equal(isPendingVerificationStatus("INACTIVE"), false);
});

test("isPendingVerificationStatus: agrees with PENDING_VERIFICATION_STATUSES for every real status — no drift between the constant and the predicate", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(isPendingVerificationStatus(status), (PENDING_VERIFICATION_STATUSES as VerificationStatus[]).includes(status));
  }
});
