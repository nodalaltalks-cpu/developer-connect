import { requireFounder } from "@/lib/auth";
import { currentUser } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { FounderCallButton } from "@/components/admin/leads/founder-call-button";
import { ReturnedCard } from "@/components/leads/missed-card";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getReturnedLeads } from "@/lib/leads/follow-up-reads";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Returned leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function AdminReturnedLeadsPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();

  const names = staffNameMap(await createPostgresStaffRepository().list());
  const items = await getReturnedLeads(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id });

  return (
    <div>
      <SectionHeading title="Returned leads" description="Leads a team member sent back to you, with why — until you assign them again. Their full history is kept on each lead." />
      <h2 className="text-sm font-medium text-foreground">Waiting for you · {items.length}</h2>
      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing returned" description="No team member has returned a lead that is still waiting." />
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <ReturnedCard
              key={item.lead.id}
              item={item}
              href={`/admin/leads/${item.lead.id}`}
              callSlot={<FounderCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />}
              returnedByName={item.returnedBy ? (names[item.returnedBy] ?? "a team member") : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
