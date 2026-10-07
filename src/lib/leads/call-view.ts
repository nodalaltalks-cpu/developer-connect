import type { CallClassification, CallDisposition, CallMethod, CallStatus, LeadCall } from "./types.ts";

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
  /** Set by the server from the duration: more than 10 seconds = CONNECTED, otherwise DIALED. null until finished. */
  classification: CallClassification | null;
  method: CallMethod;
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
    classification: call.classification,
    method: call.method,
    disposition: call.disposition,
    staffUserId: call.staffUserId,
  };
}

export const isFinished = (status: CallStatus): boolean => status === "COMPLETED" || status === "NO_ANSWER" || status === "BUSY" || status === "FAILED" || status === "REJECTED";
/**
 * What a call is called on screen. CONNECTED comes only from the server's classification (more than 10 seconds); a
 * finished call that did not connect is "Dialed" unless how it ended is more specific (no answer, busy, rejected).
 */
export function describeCall(call: Pick<CallView, "classification" | "status">): string {
  if (call.classification === "CONNECTED") return "Connected";
  if (call.classification === "DIALED") return call.status === "NO_ANSWER" ? "No answer" : call.status === "BUSY" ? "Busy" : call.status === "REJECTED" ? "Rejected" : "Dialed";
  if (call.status === "FAILED") return "Failed";
  return call.status === "INITIATED" ? "Dialing" : call.status === "RINGING" ? "Ringing" : "In progress";
}

/** Connected = the server classified the call as lasting more than 10 seconds. */
export const wasConnected = (call: Pick<CallView, "classification">): boolean => call.classification === "CONNECTED";
