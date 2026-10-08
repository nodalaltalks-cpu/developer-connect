import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { listMyBatches } from "@/lib/leads/calling-batch-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeFull } from "@/lib/leads/format";

export const metadata = {
  title: "Calling queue | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function CallingQueuePage() {
  // Scope is the signed-in member's own id from the session — never from the URL.
  const { actor } = await requireEmployee();
  const batches = await listMyBatches(createPostgresLeadRepositories(), actor);

  return (
    <div>
      <SectionHeading title="Calling queue" description="Lists of leads given to you to call. Open one and tap Call — your phone asks which SIM to use." />
      {batches.length === 0 ? (
        <EmptyState title="Nothing to call yet" description="When the Founder gives you a calling list it appears here." />
      ) : (
        <ul className="space-y-3">
          {batches.map(({ batch, counts }) => (
            <li key={batch.id}>
              <Link href={`/team/queue/${batch.id}`} className="block rounded-lg border border-border p-4 hover:bg-muted">
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">{batch.name}</span>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">{batch.status === "ACTIVE" ? "Active" : "Closed"}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">Created {formatDateTimeFull(batch.createdAt)}</span>
                <span className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Stat label="Total" value={counts.assigned} />
                  <Stat label="Called" value={counts.completed} />
                  <Stat label="Connected" value={counts.connected} />
                  <Stat label="Not connected" value={counts.notConnected} />
                  <Stat label="Callback" value={counts.callback} />
                  <Stat label="Remaining" value={counts.pending + counts.skipped} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md bg-muted px-2 py-2">
      <span className="block text-base font-semibold text-foreground">{value}</span>
      <span className="block text-muted-foreground">{label}</span>
    </span>
  );
}
