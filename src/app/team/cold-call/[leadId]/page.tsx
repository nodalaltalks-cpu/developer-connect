import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { ColdCallForm } from "@/components/team/cold-call-form";
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
  // A lead the signed-in person may not see looks exactly like a lead that does not exist.
  if (!lead || !canViewLead(actor, lead)) notFound();
  return (
    <div>
      <SectionHeading title="Call details" description="Add what you learned on the call. Everything is saved to this lead's history together." />
      <ColdCallForm leadId={lead.id} phoneLast4={lead.phoneE164 ? lead.phoneE164.slice(-4) : null} initialName={lead.name} initialEmail={lead.email} />
      <p className="mt-6 text-center text-sm">
        <Link href={`/team/leads/${lead.id}`} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          ← Back to the lead
        </Link>
      </p>
    </div>
  );
}
