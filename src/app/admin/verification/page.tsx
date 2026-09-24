import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getVerificationQueuePage } from "@/lib/developer-connect/verification-queue";
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
  // Only the first page of the queue is rendered — one LIMITed candidate
  // query plus one batched developer-name lookup for just those rows.
  // Further pages load on demand via "Load more" (verification-queue-list.tsx),
  // and expanding a row still fetches its own full review data separately,
  // so this initial load never pays for rows or evidence nobody has asked to see yet.
  const { rows, total } = await getVerificationQueuePage(createPostgresRepositories(), 0);

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
        <VerificationQueueList initialRows={rows} initialTotal={total} />
      )}
    </div>
  );
}
