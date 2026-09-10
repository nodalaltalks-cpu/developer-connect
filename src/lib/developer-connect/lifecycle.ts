import type { VerificationStatus } from "./types.ts";
import { InvalidTransitionError } from "./errors.ts";

/**
 * Single source of truth for which verification-status transitions are
 * legal. Deactivation ("INACTIVE") is reachable from every non-terminal
 * status as a normal, listed transition rather than a special bypass, so
 * every state change — including deactivation — goes through the same
 * validated path and produces the same audit trail.
 */
const ALLOWED_TRANSITIONS: Record<VerificationStatus, readonly VerificationStatus[]> = {
  DISCOVERED: ["PENDING_VERIFICATION", "REJECTED", "INACTIVE"],
  PENDING_VERIFICATION: ["VERIFIED", "REJECTED", "DISCOVERED", "INACTIVE"],
  VERIFIED: ["NEEDS_REVERIFICATION", "INACTIVE"],
  NEEDS_REVERIFICATION: ["VERIFIED", "REJECTED", "INACTIVE"],
  REJECTED: ["DISCOVERED", "INACTIVE"],
  INACTIVE: ["DISCOVERED"],
};

export function canTransition(from: VerificationStatus, to: VerificationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: VerificationStatus, to: VerificationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(`Cannot move a website candidate from ${from} to ${to}`);
  }
}
