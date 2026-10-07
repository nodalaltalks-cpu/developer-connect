"use server";

import { revalidatePath } from "next/cache";
import { requireEmployeeForAction } from "@/lib/team/session";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "@/lib/leads/errors";
import { addNote, logContact, type ContactChannel, type ContactOutcome } from "@/lib/leads/lead-service";
import { cancelLeadFollowUp, completeLeadFollowUp, rescheduleFollowUp, returnLeadToFounder, scheduleFollowUp } from "@/lib/leads/follow-up-service";
import { getCallForActor, placeCall, prepareDeviceCall, reportDeviceCall, setCallDisposition } from "@/lib/leads/call-service";
import { toCallView, type CallView } from "@/lib/leads/call-view";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { removeFromShortlist, shortlistProject } from "@/lib/leads/project-service";
import { changeSiteVisit, scheduleSiteVisit } from "@/lib/leads/site-visit-service";
import type { VisitChange as VisitChangeInput } from "@/components/leads/site-visits-section";
import { getTelephonyProvider, TelephonyNotConfiguredError } from "@/lib/leads/telephony";
import { businessLocalToInstant } from "@/lib/leads/format";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { createRequirement, setRequirementStatus, updateRequirementDetails } from "@/lib/leads/requirement-service";
import type { CallDisposition, CancelReason, FollowUpType, LeadActor, RequirementInput, RequirementStatus, ReturnReason } from "@/lib/leads/types";

/**
 * Team-member lead actions. Every function resolves the signed-in user to an ACTIVE staff member FIRST
 * (requireEmployeeForAction — a Server Action is its own network-callable endpoint), then the lead service checks,
 * inside its transaction, that this actor OWNS this lead. The actor is built on the server from the session: the
 * browser sends only the lead id and the content, never who is acting or who owns what. A lead that is not theirs
 * gets the same "not found" as a lead that does not exist.
 *
 * Deliberately only the activity operations (note, contact outcome, follow-up schedule/reschedule/complete/cancel),
 * returning a lead the member owns, and the buyer-requirement workflow (create, update, change status) — there is no lead status, temperature, booking, assignment or erasure action here, and none can be
 * reached by passing different arguments. A requirement id is checked to belong to THIS lead, and the lead to the
 * signed-in team member.
 */

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_FOUND = "That lead could not be found.";

async function run(leadId: string, work: (actor: LeadActor, notifier: ReturnType<typeof createLeadNotifier>) => Promise<unknown>): Promise<TeamActionResult> {
  // Authorization first, before anything else — including input checks.
  const { actor } = await requireEmployeeForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: NOT_FOUND };

  try {
    await work(actor, createLeadNotifier(createPostgresNotificationRepository()));
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError || error instanceof UnauthorizedLeadActionError) return { ok: false, error: NOT_FOUND };
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team");
  revalidatePath("/team/missed");
  return { ok: true };
}

export async function addMyLeadNoteAction(leadId: string, text: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => addNote(createPostgresLeadRepositories(), leadId, text, actor));
}

/** Logs the OUTCOME of a call or WhatsApp the team member made — never a guess that one happened. */
export async function logMyLeadContactAction(
  leadId: string,
  channel: ContactChannel,
  outcome: ContactOutcome,
  note?: string,
): Promise<TeamActionResult> {
  return run(leadId, (actor) => logContact(createPostgresLeadRepositories(), leadId, { channel, outcome, note }, actor));
}

/**
 * Schedules a follow-up at an EXACT date and time. The browser sends the wall-clock value of its date-time input; the
 * server interprets it in the business time zone (India time) — never in whatever zone the browser is set to — and
 * rejects anything that is not a full date-time in the future. If the lead already has an open follow-up it is
 * rescheduled instead.
 */
export async function setMyLeadFollowUpAction(leadId: string, scheduledAtLocal: string, type?: FollowUpType, note?: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => {
    const scheduledAt = businessLocalToInstant(scheduledAtLocal);
    if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the follow-up.");
    return scheduleFollowUp(createPostgresLeadRepositories(), leadId, { scheduledAt, type, note }, actor);
  });
}

export async function rescheduleMyLeadFollowUpAction(leadId: string, followUpId: string, scheduledAtLocal: string, type?: FollowUpType): Promise<TeamActionResult> {
  return run(leadId, (actor) => {
    const scheduledAt = businessLocalToInstant(scheduledAtLocal);
    if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the follow-up.");
    return rescheduleFollowUp(createPostgresLeadRepositories(), leadId, followUpId, { scheduledAt, type }, actor);
  });
}

export async function completeMyLeadFollowUpAction(leadId: string, followUpId?: string, note?: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => completeLeadFollowUp(createPostgresLeadRepositories(), leadId, { followUpId, note }, actor));
}

/** Cancels a follow-up with a structured reason (mandatory). */
export async function cancelMyLeadFollowUpAction(leadId: string, followUpId: string, reason: CancelReason, note?: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => cancelLeadFollowUp(createPostgresLeadRepositories(), leadId, followUpId, reason, note, actor));
}

/** Sends a lead the signed-in team member owns back to the Founder queue. The reason is mandatory. */
export async function returnMyLeadAction(leadId: string, reason: ReturnReason, note?: string): Promise<TeamActionResult> {
  return run(leadId, (actor, notifier) => returnLeadToFounder(createPostgresLeadRepositories(), leadId, reason, note, actor, new Date(), notifier));
}

export async function createMyRequirementAction(leadId: string, input: RequirementInput): Promise<TeamActionResult> {
  return run(leadId, (actor) => createRequirement(createPostgresLeadRepositories(), leadId, input, actor));
}

export async function updateMyRequirementAction(leadId: string, requirementId: string, input: RequirementInput): Promise<TeamActionResult> {
  return run(leadId, (actor) => updateRequirementDetails(createPostgresLeadRepositories(), leadId, requirementId, input, actor));
}

export async function setMyRequirementStatusAction(leadId: string, requirementId: string, status: RequirementStatus): Promise<TeamActionResult> {
  return run(leadId, (actor) => setRequirementStatus(createPostgresLeadRepositories(), leadId, requirementId, status, actor));
}


/** Builds a service change from what the browser sent. The browser proposes; the server validates every value. */
function toVisitChange(change: VisitChangeInput): Parameters<typeof changeSiteVisit>[2] {
  switch (change?.kind) {
    case "CONFIRM":
      return { kind: "CONFIRM" };
    case "COMPLETE":
      return { kind: "COMPLETE", outcome: change.outcome, notes: change.notes, nextAction: change.nextAction };
    case "NO_SHOW":
      return { kind: "NO_SHOW" };
    case "CANCEL":
      return { kind: "CANCEL", reason: change.reason };
    case "RESCHEDULE": {
      const scheduledAt = businessLocalToInstant(change.whenLocal);
      if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the visit.");
      return { kind: "RESCHEDULE", scheduledAt };
    }
    default:
      throw new LeadValidationError("change", "That is not a valid site visit change.");
  }
}

// --- projects and site visits ----------------------------------------------------------------------

export async function shortlistMyProjectAction(leadId: string, projectId: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => shortlistProject(createPostgresLeadRepositories(), leadId, projectId, actor));
}

export async function removeMyShortlistAction(leadId: string, entryId: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => removeFromShortlist(createPostgresLeadRepositories(), leadId, entryId, actor));
}

export async function scheduleMySiteVisitAction(leadId: string, whenLocal: string, projectId: string, notes: string): Promise<TeamActionResult> {
  return run(leadId, (actor) => {
    const scheduledAt = businessLocalToInstant(whenLocal);
    if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the visit.");
    return scheduleSiteVisit(createPostgresLeadRepositories(), leadId, { scheduledAt, projectId: projectId || null, notes }, actor);
  });
}

export async function changeMySiteVisitAction(leadId: string, visitId: string, change: VisitChangeInput): Promise<TeamActionResult> {
  return run(leadId, (actor) => changeSiteVisit(createPostgresLeadRepositories(), visitId, toVisitChange(change), actor, new Date(), leadId));
}

// --- the internal dialer ---------------------------------------------------------------------------

export type PlaceCallResult = { ok: true; callId: string } | { ok: false; error: string; notConfigured?: true };

/**
 * Places a call through the internal dialer. Refused — recording nothing — when no telephony provider is configured.
 * The browser says only WHICH lead; who is calling, the number, the status and every timestamp are the server's.
 */
export async function placeMyCallAction(leadId: string): Promise<PlaceCallResult> {
  const { actor } = await requireEmployeeForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: NOT_FOUND };
  try {
    const call = await placeCall(createPostgresLeadRepositories(), getTelephonyProvider(), leadId, actor);
    revalidatePath(`/team/leads/${leadId}`);
    revalidatePath("/team/calls");
    return { ok: true, callId: call.id };
  } catch (error) {
    if (error instanceof TelephonyNotConfiguredError) return { ok: false, error: error.message, notConfigured: true };
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError || error instanceof UnauthorizedLeadActionError) return { ok: false, error: NOT_FOUND };
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type PrepareDeviceCallResult = { ok: true; callId: string; phone: string } | { ok: false; error: string };

/**
 * Step 1 of a call from the employee's own phone (Android SIM): the server issues the attempt and hands the number to
 * the signed-in owner's device. Nothing is dialed or counted yet. The browser says only WHICH lead (and which batch).
 */
export async function prepareMyDeviceCallAction(leadId: string, batchId?: string | null, deviceRef?: string | null): Promise<PrepareDeviceCallResult> {
  const { actor } = await requireEmployeeForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: NOT_FOUND };
  if (batchId != null && (typeof batchId !== "string" || !UUID.test(batchId))) return { ok: false, error: NOT_FOUND };
  try {
    const { call, toE164 } = await prepareDeviceCall(createPostgresLeadRepositories(), leadId, actor, { batchId: batchId ?? null, deviceRef: deviceRef ?? null });
    return { ok: true, callId: call.id, phone: toE164 };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError || error instanceof UnauthorizedLeadActionError) return { ok: false, error: NOT_FOUND };
    return { ok: false, error: GENERIC_ERROR };
  }
}

export interface DeviceReportInput {
  /** Epoch milliseconds from the phone's own call log. */
  startedAtMs: number;
  durationSeconds: number;
  simRef?: string | null;
  callLogRef?: string | null;
  deviceRef?: string | null;
  notPlaced?: boolean;
}

/** `permanent` = the server will never accept this report (retrying cannot help); otherwise the phone should retry later. */
export type ReportDeviceCallResult = { ok: true; duplicate: boolean; call: CallView } | { ok: false; error: string; permanent?: true };

/**
 * Step 2: the phone reports its own call-log figures for an attempt the server issued to THIS member. Idempotent (a
 * retry changes nothing). The server decides CONNECTED/DIALED; the browser never sends a classification.
 */
export async function reportMyDeviceCallAction(callId: string, report: DeviceReportInput): Promise<ReportDeviceCallResult> {
  const { actor } = await requireEmployeeForAction();
  if (typeof callId !== "string" || !UUID.test(callId) || !report || typeof report !== "object") return { ok: false, error: "That call could not be found.", permanent: true };
  try {
    const result = await reportDeviceCall(
      createPostgresLeadRepositories(),
      callId,
      { startedAt: new Date(Number(report.startedAtMs)), durationSeconds: report.durationSeconds, simRef: report.simRef ?? null, callLogRef: report.callLogRef ?? null, deviceRef: report.deviceRef ?? null, notPlaced: report.notPlaced === true },
      actor,
    );
    revalidatePath(`/team/leads/${result.call.leadId}`);
    revalidatePath("/team/calls");
    // The queue is NOT revalidated here: the page would jump to the next lead while the employee is still choosing what
    // this call led to. It refreshes when the outcome is recorded (or on the next visit).
    return { ok: true, duplicate: result.duplicate, call: toCallView(result.call) };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message, permanent: true };
    if (error instanceof LeadNotFoundError || error instanceof UnauthorizedLeadActionError) return { ok: false, error: "That call could not be found.", permanent: true };
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** The current state of a call THIS member made on a lead they own — null for anything else (same as a missing call). */
export async function getMyCallStatusAction(callId: string): Promise<CallView | null> {
  const { actor } = await requireEmployeeForAction();
  const call = await getCallForActor(createPostgresLeadRepositories(), actor, callId);
  return call ? toCallView(call) : null;
}

/** What the conversation led to — once, after the call has finished, consistent with what the provider reported. */
export async function setMyCallDispositionAction(callId: string, disposition: CallDisposition): Promise<TeamActionResult> {
  const { actor } = await requireEmployeeForAction();
  try {
    const call = await setCallDisposition(createPostgresLeadRepositories(), callId, disposition, actor);
    revalidatePath(`/team/leads/${call.leadId}`);
    revalidatePath("/team/calls");
    revalidatePath("/team/queue", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError || error instanceof UnauthorizedLeadActionError) return { ok: false, error: NOT_FOUND };
    return { ok: false, error: GENERIC_ERROR };
  }
}
