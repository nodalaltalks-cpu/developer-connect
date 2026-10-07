import { currentUser } from "@clerk/nextjs/server";
import { NextStepCard } from "@/components/leads/next-step-card";
import { getNextStepForLead } from "@/lib/leads/intelligence-service";
import { ProjectsSection } from "@/components/leads/projects-section";
import { SiteVisitsSection } from "@/components/leads/site-visits-section";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadProjects } from "@/lib/leads/project-service";
import { toLeadProjectsViewModel, toSiteVisitView } from "@/lib/leads/project-view";
import { getLeadVisits } from "@/lib/leads/site-visit-service";
import { changeLeadSiteVisitAction, removeLeadShortlistAction, scheduleLeadSiteVisitAction, shortlistLeadProjectAction } from "@/app/admin/_actions/lead-actions";

/** The Founder's "Projects" and "Site visits" sections. The page has already required the Founder; the service checks again. */
export async function FounderLeadProjectsAndVisits({ leadId }: { leadId: string }) {
  const user = await currentUser();
  const actor = { actorType: "FOUNDER" as const, actorId: user!.id };
  const repos = createPostgresLeadRepositories();
  const [projects, visits, active] = await Promise.all([getLeadProjects(repos, actor, leadId), getLeadVisits(repos, actor, leadId), repos.projects.list({ activeOnly: true, limit: 200 })]);
  const names = await repos.leads.developerNames([...new Set(active.map((p) => p.developerId))]);
  const { step } = await getNextStepForLead(repos, actor, leadId);
  return (
    <>
      <NextStepCard step={step} />
      <ProjectsSection view={toLeadProjectsViewModel(projects)} onShortlist={shortlistLeadProjectAction.bind(null, leadId)} onRemove={removeLeadShortlistAction.bind(null, leadId)} />
      <SiteVisitsSection
        visits={visits.map(toSiteVisitView)}
        projects={active.map((p) => ({ id: p.id, label: `${p.name} · ${names[p.developerId] ?? "Unknown developer"}` }))}
        onSchedule={scheduleLeadSiteVisitAction.bind(null, leadId)}
        onChange={changeLeadSiteVisitAction.bind(null, leadId)}
      />
    </>
  );
}
