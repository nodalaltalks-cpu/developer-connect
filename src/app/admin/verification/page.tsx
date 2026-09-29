import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getVerificationQueuePage } from "@/lib/developer-connect/verification-queue";
import { getVerificationActivity } from "@/lib/admin-analytics/queries";
import { parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
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

export default async function AdminVerificationQueuePage({
  searchParams,
}: PageProps<"/admin/verification">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(parseDateRangeKey(resolvedSearchParams.range));

  // Only the first page of the queue is rendered — one LIMITed candidate
  // query plus one batched developer-name lookup for just those rows.
  // Further pages load on demand via "Load more" (verification-queue-list.tsx),
  // and expanding a row still fetches its own full review data separately,
  // so this initial load never pays for rows or evidence nobody has asked to see yet.
  const [{ rows, total }, activity] = await Promise.all([
    getVerificationQueuePage(createPostgresRepositories(), 0),
    getVerificationActivity(range),
  ]);

  return (
    <div>
      <SectionHeading
        title="Website Verification"
        description="Candidates that need a decision — pending review, flagged for re-verification, or freshly discovered. Click Review to open the full workspace inline. Always the current, live queue — never date-filtered."
      />

      <h2 className="mt-2 text-base font-semibold text-foreground">
        Verification activity — {range.label}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Real status transitions recorded during this period (verification_events) — NOT derived
        from today&apos;s current status, since a developer verified months ago still shows as
        &quot;Verified&quot; today. A developer flagged for re-verification then re-approved in
        the same period counts in both Verified and Needs re-verification below — each is a real,
        separate event.
      </p>
      <div className="mt-3">
        <StatGrid>
          <StatTile label="Verified" value={activity.VERIFIED} />
          <StatTile label="Rejected" value={activity.REJECTED} />
          <StatTile label="Flagged for re-verification" value={activity.NEEDS_REVERIFICATION} />
          <StatTile label="Newly discovered" value={activity.DISCOVERED} />
        </StatGrid>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Current queue</h2>
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
