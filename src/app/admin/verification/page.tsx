import Link from "next/link";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";

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
            <li key={candidate.id}>
              <Link
                href={`/admin/verification/${candidate.id}`}
                className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {developerNames.get(candidate.developerId)}
                  </p>
                  <p className="text-sm text-muted-foreground">{candidate.canonicalDomain}</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{candidate.verificationStatus}</span>
                  {" · confidence "}
                  {candidate.confidenceScore}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
