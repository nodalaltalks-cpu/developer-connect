import type { VerificationStatus, WebsiteCandidate } from "./types.ts";

const NON_TERMINAL_STATUSES: readonly VerificationStatus[] = [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "NEEDS_REVERIFICATION",
];

/**
 * The real, data-backed "this developer has unpublished changes" signal
 * for the developer detail page. A developer is published via exactly
 * one VERIFIED candidate; this looks for any OTHER candidate for the
 * same developer that's still awaiting a decision (a newly submitted
 * domain, or one flagged for re-verification) — never fabricated, and
 * never true just because a REJECTED or INACTIVE candidate exists
 * (those are resolved, not pending).
 *
 * Returns null when there is nothing pending, so callers never need to
 * invent a placeholder "no changes" state.
 */
export function findPendingCandidate(
  candidates: WebsiteCandidate[],
  verifiedCandidateId: string,
): WebsiteCandidate | null {
  return (
    candidates.find(
      (c) => c.id !== verifiedCandidateId && NON_TERMINAL_STATUSES.includes(c.verificationStatus),
    ) ?? null
  );
}
