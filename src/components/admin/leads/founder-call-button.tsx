import { CallButton } from "@/components/leads/call-button";
import { getLeadCallStatusAction, placeLeadCallAction, setLeadCallDispositionAction } from "@/app/admin/_actions/lead-actions";
import { telHref } from "@/lib/leads/contact-links";
import { getTelephonyProvider } from "@/lib/leads/telephony";

/** The Founder's Call control for one lead (same behaviour as the team member's, through the Founder's own actions). */
export function FounderCallButton({ leadId, phoneE164, compact = false }: { leadId: string; phoneE164: string | null; compact?: boolean }) {
  return (
    <CallButton
      compact={compact}
      configured={getTelephonyProvider().configured}
      telHref={telHref(phoneE164)}
      onPlace={placeLeadCallAction.bind(null, leadId)}
      onStatus={getLeadCallStatusAction}
      onDisposition={setLeadCallDispositionAction}
    />
  );
}
