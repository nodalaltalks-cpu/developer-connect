import { LeadNotFoundError, LeadStateError, LeadValidationError } from "./errors.ts";
import { setCallDisposition } from "./call-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import { cleanComment } from "./interaction-comment.ts";
import type { LeadRepositories } from "./repository.ts";
import type { CallDisposition, LeadActor, LeadCall } from "./types.ts";

/**
 * THE QUICK END OF A COLD CALL that does NOT make a lead: "not interested" (with a comment) or "did not connect" (no answer, busy,
 * switched off, wrong number). One tap or one short comment, then the employee is on to the next number.
 *
 * The call itself is already recorded and counted (dialed, and connected only if the phone measured more than 10 seconds). This
 * only records what the call led to, on the call, and keeps the comment with its date, time and day. The number stays a hidden
 * prospect: it is not a lead, it is not in anyone's list, and anyone may call it again, as often as they like.
 *
 * "Interested" is the other path: it becomes a lead only through saveColdCallLead (the short details form).
 */

export const NOT_CONNECTED_REASONS = ["NO_ANSWER", "BUSY", "SWITCHED_OFF", "INVALID_NUMBER"] as const;
export type NotConnectedReason = (typeof NOT_CONNECTED_REASONS)[number];

export const NOT_CONNECTED_LABEL: Record<NotConnectedReason, string> = {
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  SWITCHED_OFF: "Switched off",
  INVALID_NUMBER: "Wrong number",
};

export type ColdCallOutcomeInput = { outcome: "NOT_INTERESTED"; comment: unknown } | { outcome: "NOT_CONNECTED"; reason: unknown; comment?: unknown };

export async function finishColdCall(repos: LeadRepositories, callId: string, input: ColdCallOutcomeInput, actor: LeadActor, now: Date = new Date()): Promise<LeadCall> {
  assertWorkingActor(actor);
  if (!input || typeof input !== "object") throw new LeadValidationError("outcome", "Choose what the call led to.");

  let disposition: CallDisposition;
  let text: string;
  if (input.outcome === "NOT_INTERESTED") {
    const comment = cleanComment(input.comment);
    if (!comment) throw new LeadValidationError("comment", "Add a short comment on the call (a few words is enough).");
    disposition = "NOT_INTERESTED";
    text = comment;
  } else if (input.outcome === "NOT_CONNECTED") {
    const reason = input.reason;
    if (typeof reason !== "string" || !(NOT_CONNECTED_REASONS as readonly string[]).includes(reason)) throw new LeadValidationError("reason", "Choose why the call did not connect.");
    disposition = reason as CallDisposition;
    text = cleanComment(input.comment) ?? `Did not connect: ${NOT_CONNECTED_LABEL[reason as NotConnectedReason]}`;
  } else {
    throw new LeadValidationError("outcome", "Choose what the call led to.");
  }

  return repos.transaction(async (tx) => {
    const call = typeof callId === "string" ? await tx.calls.getById(callId) : null;
    if (!call) throw new LeadNotFoundError("Call not found.");
    const lead = await tx.leads.getById(call.leadId);
    if (!lead) throw new LeadNotFoundError("Call not found.");
    // Only a cold-called prospect ends this way. A lead someone owns has its own outcome flow (qualification and follow-up).
    if (!lead.prospect) throw new LeadStateError("This number is already a lead. Record the outcome from the lead.");
    if (actor.actorType === "EMPLOYEE" && call.staffUserId !== actor.actorId) throw new LeadNotFoundError("Call not found.");

    // The comment is a timestamped event on the (hidden) record, so it keeps its date, time and day.
    await tx.events.append({ leadId: lead.id, eventType: "NOTE_ADDED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { text, via: "COLD_CALL", callId }, createdAt: now });
    return setCallDisposition(tx, callId, disposition, actor, now);
  });
}
