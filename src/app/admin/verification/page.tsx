import Link from "next/link";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { buttonClassName } from "@/components/ui/button";

// Founder-only and already effectively dynamic (requireFounder() reads
// per-request auth state via the admin layout), but Next.js still
// attempts one build-time trial render of every route before it detects
// that. This page's per-candidate developer-name lookup is O(candidates
// awaiting review) network round-trips, which is fine at runtime for a
// Founder-only page loaded occasionally, but can exceed Next's per-route
// build timeout against a large backlog — observed here, unrelated to
// this task's changes. `force-dynamic` just tells Next never to attempt
// that trial render; it changes no runtime behavior.
export const dynamic = "force-dynamic";

export default async function AdminVerificationQueuePage() {
  const repos = createPostgresRepositories();
  const candidates = await repos.candidates.listByStatuses([
    "PENDING_VERIFICATION",
    "NEEDS_REVERIFICATION",
    "DISCOVERED",
  ]);

  const developerNames = new Map<string, string>();
  for (const candidate of candidates) {
    if (!developerNames.has(candidate.developerId)) {
      const developer = await repos.developers.getById(candidate.developerId);
      developerNames.set(candidate.developerId, developer?.displayName ?? "Unknown developer");
    }
  }

  return (
    <div>
      <SectionHeading
        title="Website Verification"
        description="Candidates that need a decision — pending review, flagged for re-verification, or freshly discovered."
      />

      {candidates.length === 0 ? (
        <EmptyState
          title="Nothing waiting for review"
          description="No website candidates are pending, flagged for re-verification, or newly discovered right now."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="flex min-h-11 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {developerNames.get(candidate.developerId)}
                </p>
                <p className="truncate text-sm text-muted-foreground">{candidate.canonicalDomain}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CandidateStatusBadge status={candidate.verificationStatus} />
                  {"confidence "}
                  {candidate.confidenceScore}
                </div>
                {/* Native <details>/<summary> dropdown — no client JS needed,
                    matches the "More actions" pattern already used on the
                    candidate review page itself. Both options navigate to an
                    existing route; neither approves or mutates anything. */}
                <details className="relative shrink-0">
                  <summary
                    className={buttonClassName(
                      "secondary",
                      "min-h-9 cursor-pointer list-none px-3 py-1.5 text-xs [&::-webkit-details-marker]:hidden",
                    )}
                  >
                    Review ▾
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-border bg-background py-1 shadow-md">
                    <Link
                      href={`/admin/verification/${candidate.id}`}
                      className="block min-h-11 px-3 py-2.5 text-sm leading-6 text-foreground hover:bg-muted"
                    >
                      Review developer
                    </Link>
                    <Link
                      href={`/admin/developers/${candidate.developerId}`}
                      className="block min-h-11 px-3 py-2.5 text-sm leading-6 text-foreground hover:bg-muted"
                    >
                      Open developer details
                    </Link>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
