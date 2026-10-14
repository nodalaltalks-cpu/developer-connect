import { currentUser } from "@/lib/auth";
import { ProjectsSection } from "@/components/leads/projects-section";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadProjects } from "@/lib/leads/project-service";
import { toLeadProjectsViewModel } from "@/lib/leads/project-view";
import { removeLeadShortlistAction, shortlistLeadProjectAction } from "@/app/admin/_actions/lead-actions";

/**
 * The Founder's "Projects" section. The page has already required the Founder; the service checks again. No separate site-visit
 * block (a site visit is scheduled as a follow-up of that type) and no "recommended next step" card.
 */
export async function FounderLeadProjectsAndVisits({ leadId }: { leadId: string }) {
  const user = await currentUser();
  const actor = { actorType: "FOUNDER" as const, actorId: user!.id };
  const projects = await getLeadProjects(createPostgresLeadRepositories(), actor, leadId);
  return <ProjectsSection view={toLeadProjectsViewModel(projects)} onShortlist={shortlistLeadProjectAction.bind(null, leadId)} onRemove={removeLeadShortlistAction.bind(null, leadId)} />;
}
