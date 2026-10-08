import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/team/session";
import { TeamLeadActions } from "@/components/team/team-lead-actions";
import { StatusBadge, TemperatureBadge } from "@/components/admin/leads/lead-badges";
import { InterestCard, TimelineCard } from "@/components/admin/leads/lead-detail-sections";
import { CallHistoryCard } from "@/components/leads/call-history";
import { FollowUpSection } from "@/components/leads/follow-up-section";
import { RequirementSection } from "@/components/leads/requirement-section";
import { ReturnLeadCard } from "@/components/team/return-lead-card";
import { TeamCallButton } from "@/components/team/team-call-button";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { telHref, whatsappHref } from "@/lib/leads/contact-links";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import { MissedFollowUpBlockError } from "@/lib/leads/errors";
import { toCallView } from "@/lib/leads/call-view";
import { toFollowUpView } from "@/lib/leads/follow-up-view";
import { leadSourceLabel } from "@/lib/leads/lead-source";
import { getTelephonyProvider } from "@/lib/leads/telephony";
import { getMyLeadDetail } from "@/lib/leads/lead-reads";
import { TeamLeadProjectsAndVisits } from "@/app/team/_components/lead-projects-visits";
import { prefillFromLead, toRequirementView } from "@/lib/leads/requirement-view";
import {
  cancelMyLeadFollowUpAction,
  completeMyLeadFollowUpAction,
  createMyRequirementAction,
  rescheduleMyLeadFollowUpAction,
  returnMyLeadAction,
  setMyLeadFollowUpAction,
  setMyRequirementStatusAction,
  updateMyRequirementAction,
} from "@/app/team/_actions/team-actions";

export const metadata = {
  title: "Lead | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TeamLeadDetailPage({ params }: PageProps<"/team/leads/[id]">) {
  // Checked here as well as in the layout: a layout is not re-run on every client navigation, and this page reads a
  // buyer's phone number. The actor is built from the session; ownership is enforced by the read itself.
  const { actor, member } = await requireEmployee();

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const now = new Date();
  // null for a lead that is missing, erased OR someone else's — the three are indistinguishable.
  let detail;
  try {
    detail = await getMyLeadDetail(createPostgresLeadRepositories(), actor, id, now);
  } catch (error) {
    // The discipline rule: with unresolved missed follow-ups, only a lead that has one can be opened.
    if (error instanceof MissedFollowUpBlockError) {
      return (
        <div>
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm font-medium text-red-800">
            {error.message}
          </p>
          <Link href="/team/missed" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Go to missed follow-ups
          </Link>
        </div>
      );
    }
    throw error;
  }
  if (!detail) notFound();
  const { lead } = detail;

  return (
    <div>
      <Link href="/team" className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
        ← My leads
      </Link>

      <header className="mt-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground">{lead.name ?? "Unnamed lead"}</h1>
          <TemperatureBadge temperature={lead.temperature} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          <span className="text-xs text-muted-foreground">Owner: {member.employeeId} · {member.displayName}</span>
          <span className="text-xs text-muted-foreground">{leadSourceLabel(lead)}</span>
        </div>
        <p className="mt-2 text-sm text-foreground">
          {lead.phoneE164}
          <span className="text-muted-foreground"> · prefers {formatEnumLabel(lead.contactPreference)}</span>
          {lead.email ? <span className="block break-all text-muted-foreground">{lead.email}</span> : null}
        </p>
        {detail.followUp && lead.nextFollowUpAt && (
          <p
            className={`mt-2 text-sm font-medium ${
              detail.followUp === "OVERDUE" ? "text-red-700" : detail.followUp === "TODAY" ? "text-amber-700" : "text-muted-foreground"
            }`}
          >
            {detail.followUp === "OVERDUE" ? "Follow-up overdue — was due " : "Follow-up "}
            {formatDateTimeFull(lead.nextFollowUpAt)}
          </p>
        )}
      </header>

      <div className="mt-4 space-y-4">
        {/* Actions first on a phone. */}
        <TeamLeadActions
          leadId={lead.id}
          dialerConfigured={getTelephonyProvider().configured}
          callSlot={<TeamCallButton leadId={lead.id} phoneE164={lead.phoneE164} />}
          telHref={telHref(lead.phoneE164)}
          whatsappHref={whatsappHref(lead.phoneE164)}
          prefersWhatsApp={lead.contactPreference === "WHATSAPP"}
        />
        <CallHistoryCard calls={detail.calls.map(toCallView)} names={{ [member.userId]: member.displayName }} />
        <FollowUpSection
          followUps={detail.followUps.map(toFollowUpView)}
          nowIso={now.toISOString()}
          onSchedule={setMyLeadFollowUpAction.bind(null, lead.id)}
          onReschedule={rescheduleMyLeadFollowUpAction.bind(null, lead.id)}
          onComplete={completeMyLeadFollowUpAction.bind(null, lead.id)}
          onCancel={cancelMyLeadFollowUpAction.bind(null, lead.id)}
        />
        <RequirementSection
          requirements={detail.requirements.map(toRequirementView)}
          prefill={prefillFromLead(lead)}
          onCreate={createMyRequirementAction.bind(null, lead.id)}
          onUpdate={updateMyRequirementAction.bind(null, lead.id)}
          onSetStatus={setMyRequirementStatusAction.bind(null, lead.id)}
        />
        <TeamLeadProjectsAndVisits leadId={lead.id} actor={actor} />
        <InterestCard developerName={detail.developerName} developersViewed={detail.developersViewed} />
        <TimelineCard events={detail.events} names={{ [member.userId]: member.displayName }} />
        <ReturnLeadCard onReturn={returnMyLeadAction.bind(null, lead.id)} />
      </div>
    </div>
  );
}
