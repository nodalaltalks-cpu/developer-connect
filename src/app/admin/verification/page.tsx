import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { PENDING_VERIFICATION_STATUSES } from "@/lib/developer-connect/verification-queue-state";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { VerificationQueueList } from "@/components/admin/verification-queue-list";

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
  const candidates = await repos.candidates.listByStatuses([...PENDING_VERIFICATION_STATUSES]);

  // One batched query for every developer name the collapsed rows need —
  // not one round trip per candidate. Expanding a row fetches its own
  // full review data separately (see verification-queue-list.tsx), so
  // this initial load never pays for evidence/history/sibling-candidate
  // data nobody has asked to see yet.
  const developerIds = [...new Set(candidates.map((c) => c.developerId))];
  const developers = await repos.developers.getManyByIds(developerIds);
  const developerNames = new Map(developers.map((d) => [d.id, d.displayName]));

  const rows = candidates.map((candidate) => ({
    candidate,
    developerName: developerNames.get(candidate.developerId) ?? "Unknown developer",
  }));

  return (
    <div>
      <SectionHeading
        title="Website Verification"
        description="Candidates that need a decision — pending review, flagged for re-verification, or freshly discovered. Click Review to open the full workspace inline."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing waiting for review"
          description="No website candidates are pending, flagged for re-verification, or newly discovered right now."
        />
      ) : (
        <VerificationQueueList initialRows={rows} />
      )}
    </div>
  );
}
