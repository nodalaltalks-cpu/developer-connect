"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { eraseLeadOnFounderRequest } from "@/lib/leads/erasure";
import { LeadNotFoundError, LeadStateError, LeadValidationError } from "@/lib/leads/errors";
import { cancelLeadFollowUp, completeLeadFollowUp, rescheduleFollowUp, scheduleFollowUp } from "@/lib/leads/follow-up-service";
import { getCallForActor, placeCall, setCallDisposition } from "@/lib/leads/call-service";
import { toCallView, type CallView } from "@/lib/leads/call-view";
import { importLeadsFromCsv } from "@/lib/leads/lead-import-service";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { getTelephonyProvider, TelephonyNotConfiguredError } from "@/lib/leads/telephony";
import { businessLocalToInstant } from "@/lib/leads/format";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import {
  addNote,
  assignLead,
  changeLeadStatus,
  logContact,
  setTemperature,
  updateRequirement,
  type ContactChannel,
  type ContactOutcome,
  type LostReasonCode,
} from "@/lib/leads/lead-service";
import { createRequirement, setRequirementStatus, updateRequirementDetails } from "@/lib/leads/requirement-service";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import type { CallDisposition, CancelReason, FollowUpType, LeadActor, LeadStatus, LeadTemperature, Requirement, RequirementInput, RequirementStatus } from "@/lib/leads/types";

/**
 * Founder-only lead actions for the CRM screens. Every function calls
 * requireFounderForAction FIRST — a Server Action is its own network-callable
 * endpoint, so a hidden button is never the only thing between a non-founder
 * and a mutation — and the lead service then refuses any non-FOUNDER actor
 * a second time. The actor is built here, on the server, from the verified
 * session; nothing about "who" ever comes from the browser.
 *
 * Nothing here deletes history: every change appends to the lead's
 * immutable timeline. The one exception in spirit is eraseLeadAction, which
 * removes a buyer's PERSONAL data on request (history is kept, anonymised)
 * and appends a LEAD_ERASED event — see lib/leads/erasure.ts.
 *
 * Results carry a short, user-safe message — never a stack trace, a phone
 * number or a note's text.
 */

export type LeadActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please try again.";

async function run(leadId: string, work: (actor: LeadActor) => Promise<unknown>): Promise<LeadActionResult> {
  // Authorization first, before anything else — including input checks.
  const founderId = await requireFounderForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: "That lead could not be found." };

  try {
    await work({ actorType: "FOUNDER", actorId: founderId });
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError) return { ok: false, error: "That lead could not be found." };
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/missed-leads");
  revalidatePath("/admin/returned-leads");
  return { ok: true };
}

export async function setLeadTemperatureAction(leadId: string, temperature: LeadTemperature | null): Promise<LeadActionResult> {
  return run(leadId, (actor) => setTemperature(createPostgresLeadRepositories(), leadId, temperature, actor));
}

export async function changeLeadStatusAction(
  leadId: string,
  status: LeadStatus,
  reasonCode?: LostReasonCode,
  note?: string,
): Promise<LeadActionResult> {
  return run(leadId, (actor) => changeLeadStatus(createPostgresLeadRepositories(), leadId, status, actor, { reasonCode, note }));
}

export async function addLeadNoteAction(leadId: string, text: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => addNote(createPostgresLeadRepositories(), leadId, text, actor));
}

/** Schedules (or reschedules) the lead's follow-up at an EXACT time, read in the business time zone. See the team action of the same name. */
export async function setLeadFollowUpAction(leadId: string, scheduledAtLocal: string, type?: FollowUpType, note?: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => {
    const scheduledAt = businessLocalToInstant(scheduledAtLocal);
    if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the follow-up.");
    return scheduleFollowUp(createPostgresLeadRepositories(), leadId, { scheduledAt, type, note }, actor);
  });
}

export async function rescheduleLeadFollowUpAction(leadId: string, followUpId: string, scheduledAtLocal: string, type?: FollowUpType): Promise<LeadActionResult> {
  return run(leadId, (actor) => {
    const scheduledAt = businessLocalToInstant(scheduledAtLocal);
    if (!scheduledAt) throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the follow-up.");
    return rescheduleFollowUp(createPostgresLeadRepositories(), leadId, followUpId, { scheduledAt, type }, actor);
  });
}

export async function completeLeadFollowUpAction(leadId: string, followUpId?: string, note?: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => completeLeadFollowUp(createPostgresLeadRepositories(), leadId, { followUpId, note }, actor));
}

/** Founder override: cancel (resolve) any team member's follow-up with a structured reason. */
export async function cancelLeadFollowUpAction(leadId: string, followUpId: string, reason: CancelReason, note?: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => cancelLeadFollowUp(createPostgresLeadRepositories(), leadId, followUpId, reason, note, actor));
}

/** Logs the OUTCOME of a call or WhatsApp the founder made — never a guess that one happened. */
export async function logLeadContactAction(
  leadId: string,
  channel: ContactChannel,
  outcome: ContactOutcome,
  note?: string,
): Promise<LeadActionResult> {
  return run(leadId, (actor) => logContact(createPostgresLeadRepositories(), leadId, { channel, outcome, note }, actor));
}

export async function updateLeadRequirementAction(leadId: string, requirement: Requirement): Promise<LeadActionResult> {
  return run(leadId, (actor) => updateRequirement(createPostgresLeadRepositories(), leadId, requirement, actor));
}

/**
 * Erases a buyer's personal data at their request (founder-only, typed
 * confirmation). The id is checked as a UUID and resolved server-side after
 * authorization; there is no public equivalent of this action.
 */
export async function eraseLeadAction(leadId: string, confirmation: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => eraseLeadOnFounderRequest(createPostgresLeadRepositories(), leadId, confirmation, actor));
}

/**
 * Founder-only: assigns a lead to an ACTIVE team member, or returns it to the Founder queue (null). The assignee is
 * identified by team-record id and validated server-side (must exist and be active); the change is an
 * OWNER_CHANGED event, so the previous owner stays visible in the lead's history.
 */
export async function assignLeadAction(leadId: string, assigneeStaffId: string | null): Promise<LeadActionResult> {
  return run(leadId, (actor) =>
    assignLead(createPostgresLeadRepositories(), createPostgresStaffRepository(), leadId, assigneeStaffId, actor, new Date(), createLeadNotifier(createPostgresNotificationRepository())),
  );
}

/**
 * The structured buyer requirement (founder side). The requirement id is checked server-side to belong to THIS
 * lead — an id from another lead is "not found" — and the service re-checks the actor.
 */
export async function createRequirementAction(leadId: string, input: RequirementInput): Promise<LeadActionResult> {
  return run(leadId, (actor) => createRequirement(createPostgresLeadRepositories(), leadId, input, actor));
}

export async function updateRequirementDetailsAction(leadId: string, requirementId: string, input: RequirementInput): Promise<LeadActionResult> {
  return run(leadId, (actor) => updateRequirementDetails(createPostgresLeadRepositories(), leadId, requirementId, input, actor));
}

export async function setRequirementStatusAction(leadId: string, requirementId: string, status: RequirementStatus): Promise<LeadActionResult> {
  return run(leadId, (actor) => setRequirementStatus(createPostgresLeadRepositories(), leadId, requirementId, status, actor));
}

// --- the internal dialer (Founder) -----------------------------------------------------------------

export type LeadPlaceCallResult = { ok: true; callId: string } | { ok: false; error: string; notConfigured?: true };

/** Places a call through the internal dialer as the Founder. Refused, recording nothing, when no provider is configured. */
export async function placeLeadCallAction(leadId: string): Promise<LeadPlaceCallResult> {
  const founderId = await requireFounderForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: "That lead could not be found." };
  try {
    const call = await placeCall(createPostgresLeadRepositories(), getTelephonyProvider(), leadId, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/leads/${leadId}`);
    return { ok: true, callId: call.id };
  } catch (error) {
    if (error instanceof TelephonyNotConfiguredError) return { ok: false, error: error.message, notConfigured: true };
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError) return { ok: false, error: "That lead could not be found." };
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function getLeadCallStatusAction(callId: string): Promise<CallView | null> {
  const founderId = await requireFounderForAction();
  const call = await getCallForActor(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: founderId }, callId);
  return call ? toCallView(call) : null;
}

export async function setLeadCallDispositionAction(callId: string, disposition: CallDisposition): Promise<LeadActionResult> {
  const founderId = await requireFounderForAction();
  try {
    const call = await setCallDisposition(createPostgresLeadRepositories(), callId, disposition, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/leads/${call.leadId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError) return { ok: false, error: "That call could not be found." };
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type ImportLeadsResult =
  | { ok: true; created: number; duplicates: number; rejected: number; rejectedRows: Array<{ row: number; reason: string }>; batchName: string }
  | { ok: false; error: string };

/**
 * Imports leads from CSV text (an Excel sheet saved as CSV). Founder only. The leads are SELF_GENERATED, tied to an
 * import batch (who, when, which file and campaign) so the batch can be followed through calls and bookings.
 */
export async function importLeadsAction(csvText: string, batchName: string, campaign: string, originalFilename: string): Promise<ImportLeadsResult> {
  const founderId = await requireFounderForAction();
  try {
    const result = await importLeadsFromCsv(createPostgresLeadRepositories(), csvText, { name: batchName, campaign, originalFilename }, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/leads");
    return { ok: true, created: result.created, duplicates: result.duplicates.length, rejected: result.rejected.length, rejectedRows: result.rejected.slice(0, 20), batchName: result.batch.name };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    return { ok: false, error: GENERIC_ERROR };
  }
}
