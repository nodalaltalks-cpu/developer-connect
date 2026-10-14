import { ProjectsSection } from "@/components/leads/projects-section";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadProjects } from "@/lib/leads/project-service";
import { toLeadProjectsViewModel } from "@/lib/leads/project-view";
import type { LeadActor } from "@/lib/leads/types";
import { removeMyShortlistAction, shortlistMyProjectAction } from "@/app/team/_actions/team-actions";

/**
 * The team member's "Projects" section for a lead they own. Reads go through the service (ownership checked there).
 * There is deliberately no separate site-visit block (a site visit is scheduled as a follow-up of that type) and no
 * "recommended next step" card: the lead page is kept short so a lead can be made and updated quickly.
 */
export async function TeamLeadProjectsAndVisits({ leadId, actor }: { leadId: string; actor: LeadActor }) {
  const repos = createPostgresLeadRepositories();
  const projects = await getLeadProjects(repos, actor, leadId);
  return <ProjectsSection view={toLeadProjectsViewModel(projects)} onShortlist={shortlistMyProjectAction.bind(null, leadId)} onRemove={removeMyShortlistAction.bind(null, leadId)} />;
}
