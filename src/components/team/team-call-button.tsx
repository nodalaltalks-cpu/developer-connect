import { CallButton } from "@/components/leads/call-button";
import { getMyCallStatusAction, placeMyCallAction, prepareMyDeviceCallAction, setMyCallDispositionAction } from "@/app/team/_actions/team-actions";
import { telHref } from "@/lib/leads/contact-links";
import { getTelephonyProvider } from "@/lib/leads/telephony";

/** The team member's Call control for one lead: tracked through the internal dialer when it is connected, honestly labelled when it is not. */
export function TeamCallButton({ leadId, phoneE164, compact = false, batchId = null }: { leadId: string; phoneE164: string | null; compact?: boolean; batchId?: string | null }) {
  return (
    <CallButton
      compact={compact}
      configured={getTelephonyProvider().configured}
      telHref={telHref(phoneE164)}
      onPlace={placeMyCallAction.bind(null, leadId)}
      onPrepare={prepareMyDeviceCallAction.bind(null, leadId, batchId, null)}
      onStatus={getMyCallStatusAction}
      onDisposition={setMyCallDispositionAction}
    />
  );
}
