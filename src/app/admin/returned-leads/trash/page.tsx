import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { TrashedLeadActions } from "@/components/admin/leads/lead-trash-buttons";
import { StatusBadge } from "@/components/admin/leads/lead-badges";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeWithDay } from "@/lib/leads/format";

export const metadata = {
  title: "Lead trash | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function AdminLeadTrashPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const leads = await createPostgresLeadRepositories().leads.listTrashed(200);

  return (
    <div>
      <LiveRefresh />
      <Link href="/admin/returned-leads" className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← Returned leads
      </Link>
      <SectionHeading title="Trash" description="Leads you moved out of Returned leads. Restore one to work it again, or delete it permanently (this removes the buyer's details for good)." />
      <h2 className="text-sm font-medium text-foreground">In Trash · {leads.length}</h2>
      {leads.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Trash is empty" description="Leads you move to Trash from Returned leads appear here." />
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {leads.map((lead) => (
            <li key={lead.id} className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In Trash</p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">{lead.name ?? "Unnamed lead"}</p>
              <p className="text-sm text-muted-foreground">{lead.phoneE164}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge status={lead.status} />
                <span className="text-xs text-muted-foreground">Trashed {formatDateTimeWithDay(lead.trashedAt!)}</span>
              </div>
              <TrashedLeadActions leadId={lead.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
