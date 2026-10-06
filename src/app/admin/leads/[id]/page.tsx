import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFounder } from "@/lib/auth";
import { LeadActionsPanel } from "@/components/admin/leads/lead-actions-panel";
import { StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
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
import { formatDateTime, formatEnumLabel } from "@/lib/leads/format";
import { getLeadDetail } from "@/lib/leads/lead-reads";

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
          <span className="text-xs text-muted-foreground">{lead.ownerId ? "Assigned" : "Owner: Founder"}</span>
        </div>
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
            {formatDateTime(lead.nextFollowUpAt)}
          </p>
        )}
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_24rem]">
        {/* On a phone the actions come first (DOM order); on desktop they sit in the right column. */}
        {!erased && (
          <div className="lg:order-2">
            <LeadActionsPanel
              leadId={lead.id}
              telHref={telHref(lead.phoneE164)}
              whatsappHref={whatsappHref(lead.phoneE164)}
              prefersWhatsApp={lead.contactPreference === "WHATSAPP"}
              temperature={lead.temperature}
              status={lead.status}
              nextFollowUpAt={lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString() : null}
              requirement={{
                location: lead.location,
                budgetMin: lead.budgetMin,
                budgetMax: lead.budgetMax,
                budgetCurrency: lead.budgetCurrency,
                configuration: lead.configuration,
                propertyType: lead.propertyType,
                purpose: lead.purpose,
                timeline: lead.timeline,
              }}
            />
          </div>
        )}

        <div className="space-y-4">
          <RequirementCard lead={lead} />
          <InterestCard developerName={detail.developerName} developersViewed={detail.developersViewed} developerWebsite={developerWebsite} />
          <AttributionCard firstTouch={detail.firstTouch} lastTouch={detail.lastTouch} sourceCta={lead.sourceCta} />
          <BookingsCard bookings={detail.bookings} />
          <TimelineCard events={detail.events} />
          <ConsentCard consents={detail.consents} />
          <AuditCard lead={lead} />
        </div>
      </div>
    </div>
  );
}
