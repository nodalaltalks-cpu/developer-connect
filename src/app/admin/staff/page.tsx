import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { StaffManager } from "@/components/admin/staff-manager";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

export const metadata = {
  title: "Team | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();

  const [members, counts] = await Promise.all([
    createPostgresStaffRepository().list(),
    createPostgresLeadRepositories().leads.countByOwner(),
  ]);

  return (
    <div>
      <SectionHeading title="Team" description="People who can work leads you assign to them. Private — visible only to you." />
      <StaffManager
        rows={members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          active: m.active,
          leadCount: counts[m.userId] ?? 0,
        }))}
      />
    </div>
  );
}
