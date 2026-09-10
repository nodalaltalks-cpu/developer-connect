import type { VerificationStatus } from "@/lib/developer-connect/types";

/**
 * Purely presentational — mirrors the existing VerificationStatus state
 * machine (candidate-service.ts / verification-service.ts) without adding
 * to it. Color coding exists only to help a founder scan a list of
 * candidates and see at a glance what still needs a decision.
 */
const STATUS_STYLES: Record<VerificationStatus, string> = {
  DISCOVERED: "bg-muted text-muted-foreground border-border",
  PENDING_VERIFICATION: "bg-amber-50 text-amber-800 border-amber-200",
  NEEDS_REVERIFICATION: "bg-amber-50 text-amber-800 border-amber-200",
  VERIFIED: "bg-accent-soft text-accent-hover border-accent-soft",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  INACTIVE: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<VerificationStatus, string> = {
  DISCOVERED: "Discovered",
  PENDING_VERIFICATION: "Pending review",
  NEEDS_REVERIFICATION: "Needs re-verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  INACTIVE: "Inactive",
};

export function CandidateStatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
