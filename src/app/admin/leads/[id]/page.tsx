import { LeadJourney } from "@/components/leads/lead-journey";
import { getLeadJourney } from "@/lib/leads/lead-journey";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFounder } from "@/lib/auth";
import { LeadActionsPanel } from "@/components/admin/leads/lead-actions-panel";
import { LeadEraseCard } from "@/components/admin/leads/lead-erase-card";
import { LeadOwnerCard } from "@/components/admin/leads/lead-owner-card";
import { FounderCallButton } from "@/components/admin/leads/founder-call-button";
import { CallHistoryCard } from "@/components/leads/call-history";
import { FollowUpSection } from "@/components/leads/follow-up-section";
import { RequirementSection } from "@/components/leads/requirement-section";
import { FounderLeadProjectsAndVisits } from "@/app/admin/leads/_components/lead-projects-visits";
import { FounderLeadBookings } from "@/app/admin/leads/_components/lead-bookings";
import { SourceBadge, StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
import { QualificationCard } from "@/components/leads/qualification-card";
import {
  AttributionCard,
  AuditCard,
  BookingsCard,
  ConsentCard,
  InterestCard,
  RequirementCard,
  TimelineCard,
} from "@/components/admin/leads/lead-detail-sections";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { telHref, whatsappHref } from "@/lib/leads/contact-links";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import { getLeadDetail } from "@/lib/leads/lead-reads";
import { prefillFromLead, toRequirementView } from "@/lib/leads/requirement-view";
import { toCallView } from "@/lib/leads/call-view";
import { toFollowUpView } from "@/lib/leads/follow-up-view";
import { getTelephonyProvider } from "@/lib/leads/telephony";
import {
  cancelLeadFollowUpAction,
  completeLeadFollowUpAction,
  createRequirementAction,
  recordLeadQualificationAction,
  rescheduleLeadFollowUpAction,
  setLeadFollowUpAction,
  setRequirementStatusAction,
  updateRequirementDetailsAction,
} from "@/app/admin/_actions/lead-actions";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Lead | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminLeadDetailPage({ params }: PageProps<"/admin/leads/[id]">) {
  // Checked here as well as in the layout: a layout is not re-run on every
  // client navigation, and this page reads a buyer's phone number.
  await requireFounder();

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const now = new Date();
  const detail = await getLeadDetail(createPostgresLeadRepositories(), id, now);
  if (!detail) notFound();
  const { lead } = detail;
  const journey = await getLeadJourney(createPostgresLeadRepositories(), lead);
  const team = await createPostgresStaffRepository().list();
  const names = staffNameMap(team);
  const ownerName = lead.ownerId ? (names[lead.ownerId] ?? "Team member") : undefined;
  const erased = lead.erasedAt !== null;

  // The developer's verified website is INTERNAL data: only this founder-only page reads it (after requireFounder above),
  // and it is never returned to a buyer or rendered on a public page.
  const verified =
    lead.developerId && !erased ? await createPostgresRepositories().candidates.getVerifiedForDeveloper(lead.developerId) : null;
  const developerWebsite = verified ? { url: verified.url, domain: verified.canonicalDomain } : null;

  return (
    <div>
      <Link href="/admin/leads" className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← All leads
      </Link>

      <header className="mt-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground">
            {erased ? "Erased lead" : (lead.name ?? "Unnamed lead")}
          </h1>
          <TemperatureBadge temperature={lead.temperature} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          <span className="text-xs text-muted-foreground">Owner: {ownerName ?? "Founder"}</span>
          <SourceBadge lead={lead} />
        </div>
        {!erased && <p className="mt-2 text-xs text-muted-foreground">{detail.contactBasis.statement}</p>}
        {!erased && (
          <p className="mt-2 text-sm text-foreground">
            {lead.phoneE164}
            <span className="text-muted-foreground"> · prefers {formatEnumLabel(lead.contactPreference)}</span>
            {lead.email ? <span className="block break-all text-muted-foreground">{lead.email}</span> : null}
          </p>
        )}
        {detail.followUp && lead.nextFollowUpAt && (
          <p className={`mt-2 text-sm font-medium ${detail.followUp === "OVERDUE" ? "text-red-700" : detail.followUp === "TODAY" ? "text-amber-700" : "text-muted-foreground"}`}>
            {detail.followUp === "OVERDUE" ? "Follow-up overdue — was due " : "Follow-up "}
            {formatDateTimeFull(lead.nextFollowUpAt)}
          </p>
        )}
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* On a phone the actions come first (DOM order); on desktop they sit in the right column. */}
        {!erased && (
          <div className="lg:order-2">
            <LeadActionsPanel
              leadId={lead.id}
              dialerConfigured={getTelephonyProvider().configured}
              callSlot={<FounderCallButton leadId={lead.id} phoneE164={lead.phoneE164} />}
              telHref={telHref(lead.phoneE164)}
              whatsappHref={whatsappHref(lead.phoneE164)}
              prefersWhatsApp={lead.contactPreference === "WHATSAPP"}
              temperature={lead.temperature}
              status={lead.status}
            />
          </div>
        )}

        <div className="space-y-4">
          {!erased && <LeadJourney steps={journey} />}
          {!erased && (
            <LeadOwnerCard
              leadId={lead.id}
              currentOwnerId={lead.ownerId}
              currentOwnerName={ownerName ?? null}
              members={team.filter((m) => m.active).map((m) => ({ id: m.id, userId: m.userId, name: m.displayName }))}
              ownerInactive={lead.ownerId !== null && team.some((m) => m.userId === lead.ownerId && !m.active)}
            />
          )}
          {!erased && (
            <QualificationCard
              status={lead.status}
              latest={detail.qualification ? { outcome: detail.qualification.outcome, reason: detail.qualification.reason, atLabel: formatDateTimeFull(detail.qualification.at) } : null}
              restrictToTeamMoves={false}
              onRecord={recordLeadQualificationAction.bind(null, lead.id)}
            />
          )}
          {!erased && <CallHistoryCard calls={detail.calls.map(toCallView)} names={names} />}
          {!erased && (
            <FollowUpSection
              followUps={detail.followUps.map(toFollowUpView)}
              nowIso={now.toISOString()}
              onSchedule={setLeadFollowUpAction.bind(null, lead.id)}
              onReschedule={rescheduleLeadFollowUpAction.bind(null, lead.id)}
              onComplete={completeLeadFollowUpAction.bind(null, lead.id)}
              onCancel={cancelLeadFollowUpAction.bind(null, lead.id)}
            />
          )}
          {erased ? (
            <RequirementCard lead={lead} />
          ) : (
            <RequirementSection
              requirements={detail.requirements.map(toRequirementView)}
              prefill={prefillFromLead(lead)}
              onCreate={createRequirementAction.bind(null, lead.id)}
              onUpdate={updateRequirementDetailsAction.bind(null, lead.id)}
              onSetStatus={setRequirementStatusAction.bind(null, lead.id)}
            />
          )}
          {!erased && <FounderLeadProjectsAndVisits leadId={lead.id} />}
          <InterestCard developerName={detail.developerName} developersViewed={detail.developersViewed} developerWebsite={developerWebsite} />
          <AttributionCard firstTouch={detail.firstTouch} lastTouch={detail.lastTouch} sourceCta={lead.sourceCta} />
          {erased ? <BookingsCard bookings={detail.bookings} /> : <FounderLeadBookings leadId={lead.id} bookings={detail.bookings} />}
          <TimelineCard events={detail.events} names={names} />
          <ConsentCard consents={detail.consents} />
          <AuditCard lead={lead} ownerName={ownerName} />
          {!erased && <LeadEraseCard leadId={lead.id} />}
        </div>
      </div>
    </div>
  );
}
