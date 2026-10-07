import { requireEmployee } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { OpenVisitsList } from "@/components/leads/open-visits-list";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { listOpenVisits } from "@/lib/leads/site-visit-service";

export const metadata = {
  title: "Site visits | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeamVisitsPage() {
  // Scope is the signed-in member's own id from the session - never from the URL.
  const { actor } = await requireEmployee();
  const visits = await listOpenVisits(createPostgresLeadRepositories(), actor, new Date());
  return (
    <div>
      <SectionHeading title="Site visits" description="Your open site visits, soonest first. Open one to confirm it or record what happened." />
      <OpenVisitsList visits={visits} basePath="/team/leads" />
    </div>
  );
}
