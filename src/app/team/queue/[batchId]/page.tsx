import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { TeamCallButton } from "@/components/team/team-call-button";
import { SkipLeadButton } from "@/components/team/skip-lead-button";
import { getCallingQueue, type QueueRow, type QueueState } from "@/lib/leads/calling-batch-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeFull } from "@/lib/leads/format";
import { leadSourceLabel } from "@/lib/leads/lead-source";

export const metadata = {
  title: "Calling queue | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATE_LABEL: Record<QueueState, string> = { PENDING: "To call", SKIPPED: "Skipped", CONNECTED: "Connected", DIALED: "Not connected", ATTEMPTED: "Called (length not recorded)", RETURNED: "Returned", REASSIGNED: "Moved" };

export default async function CallingQueueBatchPage({ params }: PageProps<"/team/queue/[batchId]">) {
  const { batchId } = await params;
  const { actor } = await requireEmployee();
  if (!UUID.test(batchId)) notFound();
  // Another member's batch is "not found", exactly like one that does not exist.
  const queue = await getCallingQueue(createPostgresLeadRepositories(), actor, batchId);
  if (!queue) notFound();
  const { counts, next } = queue;

  return (
    <div>
      <Link href="/team/queue" className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← All lists
      </Link>
      <SectionHeading title={queue.batch.name} description={`${counts.completed} of ${counts.assigned} called · ${counts.pending + counts.skipped} to go`} />

      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progress through this list" aria-valuemin={0} aria-valuemax={counts.assigned} aria-valuenow={counts.completed}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${counts.assigned > 0 ? Math.round((counts.completed / counts.assigned) * 100) : 0}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
        <Tile label="Total" value={counts.assigned} />
        <Tile label="Called" value={counts.completed} />
        <Tile label="Connected" value={counts.connected} />
        <Tile label="Not connected" value={counts.notConnected} />
        <Tile label="Callback" value={counts.callback} />
        <Tile label="Remaining" value={counts.pending + counts.skipped} />
        {counts.skipped > 0 && <Tile label="Skipped" value={counts.skipped} />}
        {counts.attempted > 0 && <Tile label="Length not recorded" value={counts.attempted} />}
        {counts.returned > 0 && <Tile label="Returned" value={counts.returned} />}
      </div>

      {next ? (
        <section aria-label="Next call" className="mt-5 rounded-lg border border-accent p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-hover">{next.state === "SKIPPED" ? "Next call (you skipped this one earlier)" : "Next call"}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{next.progress.lead.name ?? "Unnamed lead"}</p>
          <p className="text-sm text-muted-foreground">{next.progress.lead.phoneE164}</p>
          <div className="mt-3">
            <TeamCallButton key={next.progress.lead.id} leadId={next.progress.lead.id} phoneE164={next.progress.lead.phoneE164} batchId={queue.batch.id} />
          </div>
          {next.state === "PENDING" && (
            <div className="mt-2">
              <SkipLeadButton batchId={queue.batch.id} leadId={next.progress.lead.id} />
            </div>
          )}
        </section>
      ) : (
        <p role="status" className="mt-5 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          {counts.assigned === 0 ? "This list is empty." : "Every lead in this list has been called. Nice work."}
        </p>
      )}

      <h2 className="mt-6 text-sm font-medium text-foreground">All leads in this list</h2>
      {queue.rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No leads" description="This list has no leads." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {queue.rows.map((row) => (
            <QueueItem key={row.progress.lead.id} row={row} batchId={queue.batch.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md bg-muted px-2 py-2">
      <span className="block text-base font-semibold text-foreground">{value}</span>
      <span className="block text-muted-foreground">{label}</span>
    </span>
  );
}

function QueueItem({ row, batchId }: { row: QueueRow; batchId: string }) {
  const { lead, lastCallAt, lastClassification, calls } = row.progress;
  const mine = row.state !== "RETURNED" && row.state !== "REASSIGNED";
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {mine ? (
            <Link href={`/team/leads/${lead.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
              {lead.name ?? "Unnamed lead"}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium text-muted-foreground">{lead.name ?? "Unnamed lead"}</span>
          )}
          {mine && <span className="block text-xs text-muted-foreground">{lead.phoneE164}</span>}
          <span className="block text-xs text-muted-foreground">{leadSourceLabel(lead)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{STATE_LABEL[row.state]}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {calls > 0 && lastCallAt
          ? `Last call ${formatDateTimeFull(lastCallAt)} · ${lastClassification === "CONNECTED" ? "Connected" : "Dialed"} · ${calls} ${calls === 1 ? "call" : "calls"}`
          : "Not called yet"}
        {mine && lead.nextFollowUpAt ? ` · Follow-up ${formatDateTimeFull(lead.nextFollowUpAt)}` : ""}
      </p>
      {mine && lead.phoneE164 && row.state !== "PENDING" && (
        <div className="mt-2">
          <TeamCallButton leadId={lead.id} phoneE164={lead.phoneE164} batchId={batchId} compact />
        </div>
      )}
    </li>
  );
}
