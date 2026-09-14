import type { VerificationStatus } from "./types.ts";

/**
 * The exact set of statuses the Founder verification queue lists — one
 * place, shared by the page's own listByStatuses() query and the inline
 * accordion's client-side "does this candidate still belong in the
 * pending queue" check, so the two can never quietly drift apart.
 */
export const PENDING_VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "PENDING_VERIFICATION",
  "NEEDS_REVERIFICATION",
  "DISCOVERED",
];

export function isPendingVerificationStatus(status: VerificationStatus): boolean {
  return (PENDING_VERIFICATION_STATUSES as VerificationStatus[]).includes(status);
}

/**
 * The subset of PENDING_VERIFICATION_STATUSES that has not yet had ANY
 * founder decision at all — used by the Founder Overview's "Pending
 * verification" tile, which shows this separately from its own
 * neighboring "Needs re-verification" tile (NEEDS_REVERIFICATION is
 * intentionally excluded here because it already has that dedicated
 * tile). The two Overview tiles' counts always sum to exactly
 * PENDING_VERIFICATION_STATUSES' total — i.e. to the /admin/verification
 * queue's own size — so the dashboard and the queue can never silently
 * disagree about how many candidates need Founder attention.
 */
export const PENDING_REVIEW_STATUSES: readonly VerificationStatus[] = ["DISCOVERED", "PENDING_VERIFICATION"];
