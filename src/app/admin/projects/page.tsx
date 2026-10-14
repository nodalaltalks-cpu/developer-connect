import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { ProjectForm, ProjectStatusButton } from "@/components/admin/project-form";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatMoney } from "@/lib/leads/format";
import { listProjectsForFounder } from "@/lib/leads/project-service";

export const metadata = {
  title: "Projects | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const repos = createPostgresLeadRepositories();
  const [projects, developers, leadCounts] = await Promise.all([
    listProjectsForFounder(repos, { actorType: "FOUNDER", actorId: user!.id }),
    createPostgresRepositories().developers.list({ status: "ACTIVE" }),
    // Leads currently being sent each project's details (erased leads are not counted).
    repos.shortlist.countActiveByProject(),
  ]);
  const totalChosen = Object.values(leadCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title="Projects" description="The inventory the matcher reads, and how many leads are being sent each project's details. Tap a project to see those leads." />
      {totalChosen > 0 && <p className="-mt-3 mb-4 text-sm text-muted-foreground">{totalChosen} project {totalChosen === 1 ? "choice" : "choices"} across your leads.</p>}

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" description="Add a project below. Team members can then see how well it fits each buyer's requirement." />
      ) : (
        <ul className="space-y-2">
          {projects.map(({ project, developerName }) => (
            <li key={project.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {project.name} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{project.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {developerName} · {[project.locality, project.city].filter(Boolean).join(", ")}
                  {project.propertyType ? ` · ${project.propertyType}` : ""}
                  {project.configurations.length ? ` · ${project.configurations.join(", ")}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {project.currency && (project.priceMin !== null || project.priceMax !== null)
                    ? `${project.priceMin !== null ? formatMoney(project.priceMin, project.currency) : "—"} to ${project.priceMax !== null ? formatMoney(project.priceMax, project.currency) : "—"}`
                    : "Price not recorded"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Link href={`/admin/projects/${project.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm font-semibold text-accent-hover hover:bg-muted">
                  {leadCounts[project.id] ?? 0} {(leadCounts[project.id] ?? 0) === 1 ? "lead" : "leads"}
                </Link>
                <ProjectStatusButton projectId={project.id} status={project.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold text-foreground">Add a project</h2>
      <div className="mt-3">
        <ProjectForm developers={developers.map((d) => ({ id: d.id, name: d.displayName }))} />
      </div>
    </div>
  );
}
