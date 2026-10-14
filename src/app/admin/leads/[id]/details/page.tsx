import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFounder } from "@/lib/auth";
import { LeadJourney } from "@/components/leads/lead-journey";
import { FounderLeadBookings } from "@/app/admin/leads/_components/lead-bookings";
import { AttributionCard, AuditCard, BookingsCard, ConsentCard, TimelineCard } from "@/components/admin/leads/lead-detail-sections";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadJourney } from "@/lib/leads/lead-journey";
import { getLeadDetail } from "@/lib/leads/lead-reads";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Lead details | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything about a lead that is NOT needed to make or update it, kept together on one founder-only page so the lead screen itself
 * stays short: the booking and commission, the journey, where the lead came from, the consent on record, the record of the lead and
 * the complete append-only activity log. Employees never see this page.
 */
export default async function LeadDetailsPage({ params }: PageProps<"/admin/leads/[id]/details">) {
  await requireFounder();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const repos = createPostgresLeadRepositories();
  const detail = await getLeadDetail(repos, id, new Date());
  if (!detail) notFound();
  const { lead } = detail;
  const erased = lead.erasedAt !== null;
  const team = await createPostgresStaffRepository().list();
  const names = staffNameMap(team);
  const ownerName = lead.ownerId ? (names[lead.ownerId] ?? "Team member") : undefined;
  const journey = erased ? [] : await getLeadJourney(repos, lead);

  return (
    <div>
      <Link href={`/admin/leads/${lead.id}`} className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← Back to the lead
      </Link>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{erased ? "Erased lead" : (lead.name ?? "Unnamed lead")}: details</h1>
      <p className="mt-1 text-sm text-muted-foreground">Booking and commission, journey, source, consent, record and the full log. Founder only.</p>

      <div className="mt-4 space-y-4">
        {erased ? <BookingsCard bookings={detail.bookings} /> : <FounderLeadBookings leadId={lead.id} bookings={detail.bookings} />}
        {!erased && <LeadJourney steps={journey} />}
        <AttributionCard firstTouch={detail.firstTouch} lastTouch={detail.lastTouch} sourceCta={lead.sourceCta} />
        <ConsentCard consents={detail.consents} />
        <AuditCard lead={lead} ownerName={ownerName} />
        <TimelineCard events={detail.events} names={names} />
      </div>
    </div>
  );
}
