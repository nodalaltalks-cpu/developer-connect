import { NextStepCard } from "@/components/leads/next-step-card";
import { getNextStepForLead } from "@/lib/leads/intelligence-service";
import { ProjectsSection } from "@/components/leads/projects-section";
import { SiteVisitsSection } from "@/components/leads/site-visits-section";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadProjects } from "@/lib/leads/project-service";
import { toLeadProjectsViewModel, toSiteVisitView } from "@/lib/leads/project-view";
import { getLeadVisits } from "@/lib/leads/site-visit-service";
import type { LeadActor } from "@/lib/leads/types";
import { changeMySiteVisitAction, removeMyShortlistAction, scheduleMySiteVisitAction, shortlistMyProjectAction } from "@/app/team/_actions/team-actions";

/** The team member's "Projects" and "Site visits" sections for a lead they own. Reads go through the service (ownership checked there). */
export async function TeamLeadProjectsAndVisits({ leadId, actor }: { leadId: string; actor: LeadActor }) {
  const repos = createPostgresLeadRepositories();
  const [projects, visits, active] = await Promise.all([getLeadProjects(repos, actor, leadId), getLeadVisits(repos, actor, leadId), repos.projects.list({ activeOnly: true, limit: 200 })]);
  const names = await repos.leads.developerNames([...new Set(active.map((p) => p.developerId))]);
  const { step } = await getNextStepForLead(repos, actor, leadId);
  return (
    <>
      <NextStepCard step={step} />
      <ProjectsSection view={toLeadProjectsViewModel(projects)} onShortlist={shortlistMyProjectAction.bind(null, leadId)} onRemove={removeMyShortlistAction.bind(null, leadId)} />
      <SiteVisitsSection
        visits={visits.map(toSiteVisitView)}
        projects={active.map((p) => ({ id: p.id, label: `${p.name} · ${names[p.developerId] ?? "Unknown developer"}` }))}
        onSchedule={scheduleMySiteVisitAction.bind(null, leadId)}
        onChange={changeMySiteVisitAction.bind(null, leadId)}
      />
    </>
  );
}
