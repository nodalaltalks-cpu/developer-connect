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
