import { currentUser } from "@clerk/nextjs/server";
import { requireFounder } from "@/lib/auth";
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

export default async function AdminSiteVisitsPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const visits = await listOpenVisits(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }, new Date(), 100);
  return (
    <div>
      <SectionHeading title="Site visits" description="Every open site visit across the team, soonest first. A visit whose time has passed is waiting for an outcome." />
      <OpenVisitsList visits={visits} basePath="/admin/leads" />
    </div>
  );
}
