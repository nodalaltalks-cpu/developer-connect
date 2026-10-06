import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { LeadImportForm } from "@/components/admin/leads/lead-import-form";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeFull } from "@/lib/leads/format";

export const metadata = {
  title: "Import leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const batches = await createPostgresLeadRepositories().importBatches.list(20);

  return (
    <div>
      <SectionHeading title="Import leads" description="Add self-generated leads from a CSV file. Each import is kept as a batch so you can follow it through calls, follow-ups and bookings." />

      <p role="note" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
        Imported leads are marked <strong>Self-generated · Excel import</strong>. They have not asked to be contacted, so no consent record exists for them — make sure
        you are allowed to call these numbers (for example, DND-registry rules) before your team does.
      </p>

      <LeadImportForm />

      <h2 className="mt-8 text-sm font-semibold text-foreground">Recent imports</h2>
      {batches.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No imports yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {batches.map((b) => (
            <li key={b.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium text-foreground">{b.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTimeFull(b.importedAt)} · {b.createdCount} created · {b.duplicateCount} duplicates · {b.rejectedCount} rejected · of {b.rowCount} rows
                {b.campaign ? ` · ${b.campaign}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
