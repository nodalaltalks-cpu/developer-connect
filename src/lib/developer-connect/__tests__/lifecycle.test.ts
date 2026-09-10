import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, assertValidTransition } from "../lifecycle.ts";
import { InvalidTransitionError } from "../errors.ts";
import type { VerificationStatus } from "../types.ts";

test("lifecycle: VERIFIED can only be reached from PENDING_VERIFICATION or NEEDS_REVERIFICATION", () => {
  const statuses: VerificationStatus[] = [
    "DISCOVERED",
    "PENDING_VERIFICATION",
    "VERIFIED",
    "REJECTED",
    "NEEDS_REVERIFICATION",
    "INACTIVE",
  ];

  for (const status of statuses) {
    const expected = status === "PENDING_VERIFICATION" || status === "NEEDS_REVERIFICATION";
    assert.equal(canTransition(status, "VERIFIED"), expected, `from ${status}`);
  }
});

test("lifecycle: DISCOVERED cannot jump directly to VERIFIED", () => {
  assert.throws(() => assertValidTransition("DISCOVERED", "VERIFIED"), InvalidTransitionError);
});

test("lifecycle: REJECTED cannot jump directly to VERIFIED, it must be rediscovered first", () => {
  assert.throws(() => assertValidTransition("REJECTED", "VERIFIED"), InvalidTransitionError);
  assert.ok(canTransition("REJECTED", "DISCOVERED"));
});

test("lifecycle: any active status can be deactivated", () => {
  assert.ok(canTransition("DISCOVERED", "INACTIVE"));
  assert.ok(canTransition("PENDING_VERIFICATION", "INACTIVE"));
  assert.ok(canTransition("VERIFIED", "INACTIVE"));
  assert.ok(canTransition("NEEDS_REVERIFICATION", "INACTIVE"));
});

test("lifecycle: INACTIVE can only be reopened back to DISCOVERED", () => {
  assert.deepEqual(
    ["DISCOVERED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "NEEDS_REVERIFICATION"].filter(
      (s) => canTransition("INACTIVE", s as VerificationStatus),
    ),
    ["DISCOVERED"],
  );
});
