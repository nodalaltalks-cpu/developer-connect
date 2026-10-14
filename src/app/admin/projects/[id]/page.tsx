import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, requireFounder } from "@/lib/auth";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/leads/lead-badges";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatDateTimeWithDay } from "@/lib/leads/format";
import { getLeadsForProject } from "@/lib/leads/project-service";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Project leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The leads currently being sent one project's details: who, in what status, with whom, and since when. Founder only. */
export default async function ProjectLeadsPage({ params }: PageProps<"/admin/projects/[id]">) {
  await requireFounder();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await currentUser();
  const [result, team] = await Promise.all([
    getLeadsForProject(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }, id),
    createPostgresStaffRepository().list(),
  ]);
  if (!result) notFound();
  const owners = staffNameMap(team);

  return (
    <div>
      <LiveRefresh />
      <Link href="/admin/projects" className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← All projects
      </Link>
      <SectionHeading
        title={result.project.name}
        description={`${result.developerName}${result.project.city ? ` · ${[result.project.locality, result.project.city].filter(Boolean).join(", ")}` : ""} · ${result.leads.length} ${result.leads.length === 1 ? "lead is" : "leads are"} being sent this project's details.`}
      />
      {result.leads.length === 0 ? (
        <EmptyState title="No leads yet" description="When a lead's requirement is saved with this project chosen, the lead appears here." />
      ) : (
        <ul className="grid gap-3">
          {result.leads.map((row) => (
            <li key={row.leadId} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/leads/${row.leadId}`} className="min-w-0 truncate text-base font-semibold text-foreground hover:underline">
                  {row.name ?? "Unnamed lead"}
                </Link>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                With {row.ownerId ? (owners[row.ownerId] ?? "a team member") : "you"} · project chosen {formatDateTimeWithDay(row.chosenAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
