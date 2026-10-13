import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { QuickLeadScreen } from "@/components/team/quick-lead-screen";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { canViewLead } from "@/lib/leads/lead-access";

export const metadata = {
  title: "Call details | Developer Connects",
  robots: { index: false, follow: false },
};

// Private and per-person: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ColdCallDetailsPage({ params }: PageProps<"/team/cold-call/[leadId]">) {
  const { actor } = await requireEmployee();
  const { leadId } = await params;
  if (!UUID.test(leadId)) notFound();
  const lead = await createPostgresLeadRepositories().leads.getById(leadId);
  // A lead the signed-in person may not see looks exactly like a lead that does not exist. A cold-called prospect (not yet a lead) may be
  // qualified by any team member: saving this form is what makes it theirs.
  if (!lead || (!canViewLead(actor, lead) && !(lead.prospect && !lead.erasedAt))) notFound();
  return (
    <div>
      <SectionHeading title="Call details" description="Tap the answers; use NA where the client did not say. Saving makes this your lead." />
      <QuickLeadScreen leadId={lead.id} />
      <p className="mt-4 pb-24 text-center text-sm sm:pb-0">
        <Link href={lead.prospect ? "/team/dial" : `/team/leads/${lead.id}`} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          {lead.prospect ? "← Back to the dial pad" : "← Back to the lead"}
        </Link>
      </p>
    </div>
  );
}
