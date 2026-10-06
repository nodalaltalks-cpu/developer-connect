import type { CallDisposition, CallStatus, LeadCall } from "./types.ts";

/**
 * The serialisable shape of a call for screens (times as ISO strings). Carries only what the screens show: status,
 * provider-reported times and duration, the disposition. Never a number, a provider id or a provider payload.
 */
export interface CallView {
  id: string;
  status: CallStatus;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  disposition: CallDisposition | null;
  staffUserId: string;
}

export function toCallView(call: LeadCall): CallView {
  return {
    id: call.id,
    status: call.status,
    initiatedAt: call.initiatedAt.toISOString(),
    answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    durationSeconds: call.durationSeconds,
    disposition: call.disposition,
    staffUserId: call.staffUserId,
  };
}

export const isFinished = (status: CallStatus): boolean => status === "COMPLETED" || status === "NO_ANSWER" || status === "BUSY" || status === "FAILED" || status === "REJECTED";
export const wasConnected = (call: Pick<CallView, "answeredAt">): boolean => call.answeredAt !== null;
