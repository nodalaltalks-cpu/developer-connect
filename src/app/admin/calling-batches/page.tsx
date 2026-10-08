import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { CallingBatchForm } from "@/components/admin/calling-batch-form";
import { listAllBatches } from "@/lib/leads/calling-batch-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeFull } from "@/lib/leads/format";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Calling batches | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function CallingBatchesPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const staff = await createPostgresStaffRepository().list();
  const names = staffNameMap(staff);
  const batches = await listAllBatches(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id });
  const team = staff.filter((m) => m.active).map((m) => ({ id: m.id, name: m.displayName }));

  return (
    <div>
      <SectionHeading title="Calling batches" description="Lists of leads given to a team member to call from their phone. Progress is counted from real call records." />

      {batches.length === 0 ? (
        <EmptyState title="No calling batches yet" description="Import a CSV and give it to a team member, or create a batch from unassigned leads below." />
      ) : (
        <ul className="space-y-3">
          {batches.map(({ batch, counts }) => (
            <li key={batch.id} className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{batch.name}</p>
              <p className="text-xs text-muted-foreground">
                {names[batch.assignedTo] ?? "Unknown member"} · {batch.importBatchId ? "From a CSV import" : "From CRM leads"} · created {formatDateTimeFull(batch.createdAt)} · {batch.status === "ACTIVE" ? "Active" : "Closed"}
              </p>
              <p className="mt-2 text-xs text-foreground">
                Total {counts.assigned} · Called {counts.completed} · Connected {counts.connected} · Callback {counts.callback} · Not connected {counts.notConnected} · Remaining {counts.pending + counts.skipped}{counts.skipped > 0 ? ` (skipped ${counts.skipped})` : ""}{counts.attempted > 0 ? ` · Length not recorded ${counts.attempted}` : ""}{counts.returned > 0 ? ` · Returned ${counts.returned}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold text-foreground">Create a batch from unassigned leads</h2>
      <div className="mt-3">
        <CallingBatchForm team={team} />
      </div>
    </div>
  );
}
