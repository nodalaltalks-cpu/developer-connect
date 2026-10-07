import { currentUser } from "@clerk/nextjs/server";
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
  const [projects, developers] = await Promise.all([
    listProjectsForFounder(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }),
    createPostgresRepositories().developers.list({ status: "ACTIVE" }),
  ]);

  return (
    <div>
      <SectionHeading title="Projects" description="The inventory the matcher reads. Only what you enter is used: a blank field is treated as Unknown, never guessed." />

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
              <div className="shrink-0">
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
