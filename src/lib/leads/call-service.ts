import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor, canViewLead } from "./lead-access.ts";
import type { LeadRepositories } from "./repository.ts";
import { TelephonyNotConfiguredError, type ProviderEvent, type TelephonyProvider } from "./telephony.ts";
import {
  CALL_DISPOSITIONS,
  CONNECTED_CALL_STATUSES,
  TERMINAL_CALL_STATUSES,
  type CallDisposition,
  type CallStatus,
  type Lead,
  type LeadActor,
  type LeadCall,
  type LeadEventType,
} from "./types.ts";

/**
 * The internal dialer's domain service. Framework-free; authorization is enforced HERE.
 *
 * WHAT MAKES A CALL REAL. A call record exists only because THIS service placed it through the telephony provider
 * (placeCall) — a button click alone never creates one, and nothing from the browser (status, times, duration, ids) is
 * ever trusted. Everything that happened to the call comes from the provider's events (ingestProviderEvent), stored raw
 * and applied idempotently: the same event delivered five times changes the call once. "Connected" means the provider
 * reported the call answered. Employees can do exactly one thing to a finished call: record its disposition, once.
 *
 * Calls placed outside the dialer (a plain tel: link on a phone) leave no record here and are therefore never counted.
 */

export const DISPOSITIONS_NEEDING_CONNECTION: readonly CallDisposition[] = ["INTERESTED", "NOT_INTERESTED", "FOLLOW_UP_REQUIRED", "CALLBACK_REQUESTED"];
export const DISPOSITIONS_FOR_UNCONNECTED: readonly CallDisposition[] = ["SWITCHED_OFF", "INVALID_NUMBER"];

async function append(
  tx: LeadRepositories,
  leadId: string,
  eventType: LeadEventType,
  actor: LeadActor,
  at: Date,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.events.append({ leadId, eventType, actorType: actor.actorType, actorId: actor.actorId ?? null, developerId: null, fromStatus: null, toStatus: null, payload, createdAt: at });
}

const isConnected = (call: Pick<LeadCall, "answeredAt">) => call.answeredAt !== null;

// --- placing a call -------------------------------------------------------------------------------

/**
 * Places an outbound call to the lead through the telephony provider. Refused — with nothing recorded — when no
 * provider is configured. Allowed for the Founder (any lead) or the team member who owns the lead, subject to the
 * missed-follow-up rule like every other team-member action.
 */
export async function placeCall(
  repos: LeadRepositories,
  provider: TelephonyProvider,
  leadId: string,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadCall> {
  assertWorkingActor(actor);
  // No provider, no call, no record: a "call" that no provider placed would be fake data.
  if (!provider.configured) throw new TelephonyNotConfiguredError();

  const { call, toE164 } = await repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "PLACE_CALL", now);
    if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased and it can no longer be called.");
    if (!lead.phoneE164) throw new LeadStateError("This lead has no phone number.");
    const created = await tx.calls.create({ leadId, staffUserId: actor.actorId!, provider: provider.name, phoneLast4: lead.phoneE164.slice(-4), now });
    await append(tx, leadId, "CALL_PLACED", actor, now, { callId: created.id });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return { call: created, toE164: lead.phoneE164 };
  });

  try {
    const { providerCallId } = await provider.initiateCall({ callId: call.id, toE164, staffUserId: actor.actorId! });
    return await repos.calls.update(call.id, { providerCallId }, now);
  } catch {
    // The provider refused or could not be reached: that is a real failed attempt, recorded as one.
    return repos.transaction(async (tx) => {
      const failed = await tx.calls.update(call.id, { status: "FAILED", endedAt: now, endReason: "PROVIDER_ERROR" }, now);
      await append(tx, leadId, "CALL_ENDED", { actorType: "SYSTEM" }, now, { callId: call.id, status: "FAILED", connected: false });
      return failed;
    });
  }
}

// --- provider events ------------------------------------------------------------------------------

const RANK: Record<CallStatus, number> = { INITIATED: 0, RINGING: 1, CONNECTED: 2, COMPLETED: 3, NO_ANSWER: 3, BUSY: 3, FAILED: 3, REJECTED: 3 };

export type EventOutcome =
  | { applied: true; call: LeadCall; finished: boolean }
  | { applied: false; reason: "DUPLICATE" | "UNKNOWN_CALL" | "IGNORED" | "INCONSISTENT"; call?: LeadCall };

function validInstant(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * The state machine. Given the call as recorded and one provider event, what changes — or null when the event must
 * not change it (a late/out-of-order event, or a claim the evidence contradicts). Pure.
 */
export function nextCallState(call: LeadCall, event: ProviderEvent): { patch: Partial<LeadCall>; inconsistent?: boolean } | null {
  if (event.status === null) return null;
  if (TERMINAL_CALL_STATUSES.includes(call.status)) return null; // a finished call never changes
  if (RANK[event.status] < RANK[call.status]) return null; // out of order: older news about a call that has moved on
  const patch: Partial<LeadCall> = { status: event.status };

  if (event.status === "RINGING") patch.ringingAt = call.ringingAt ?? event.occurredAt;

  if (event.status === "CONNECTED") patch.answeredAt = call.answeredAt ?? (validInstant(event.answeredAt) ? event.answeredAt : event.occurredAt);

  if (event.status === "COMPLETED") {
    const answeredAt = call.answeredAt ?? (validInstant(event.answeredAt) ? event.answeredAt : null);
    // A completed call that was never reported answered is a contradiction: refuse to invent a connection.
    if (!answeredAt) return { patch: {}, inconsistent: true };
    const endedAt = validInstant(event.endedAt) ? event.endedAt : event.occurredAt;
    patch.answeredAt = answeredAt;
    patch.endedAt = endedAt;
    const reported = event.durationSeconds;
    patch.durationSeconds = typeof reported === "number" && Number.isInteger(reported) && reported >= 0 ? reported : Math.max(0, Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000));
  }

  if (event.status === "NO_ANSWER" || event.status === "BUSY" || event.status === "FAILED" || event.status === "REJECTED") {
    // These mean it was never answered; an answered call that then "failed" is a contradiction.
    if (call.answeredAt) return { patch: {}, inconsistent: true };
    patch.endedAt = validInstant(event.endedAt) ? event.endedAt : event.occurredAt;
  }
  if (event.endReason) patch.endReason = event.endReason;
  return { patch };
}

/**
 * Applies one verified provider event. Idempotent (the raw event is stored under the provider's event id; a repeat is a
 * no-op), tolerant of out-of-order delivery, and the only way a call's status, times and duration ever change. Appends
 * the CALL_ENDED timeline event exactly once, when the call first reaches a final status.
 */
export async function ingestProviderEvent(repos: LeadRepositories, event: ProviderEvent, now: Date = new Date()): Promise<EventOutcome> {
  if (!event || typeof event.provider !== "string" || typeof event.providerEventId !== "string" || !event.providerEventId || typeof event.providerCallId !== "string" || !validInstant(event.occurredAt)) {
    throw new LeadValidationError("event", "That is not a valid telephony event.");
  }

  return repos.transaction(async (tx): Promise<EventOutcome> => {
    const call = await tx.calls.getByProviderCallId(event.provider, event.providerCallId);
    if (!call) return { applied: false, reason: "UNKNOWN_CALL" };

    // The raw event is evidence: stored first, exactly as received. The unique key makes a redelivery a no-op.
    const { duplicate } = await tx.calls.appendEvent({
      callId: call.id,
      provider: event.provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      status: event.status,
      occurredAt: event.occurredAt,
      receivedAt: now,
      payload: event.payload ?? {},
    });
    if (duplicate) return { applied: false, reason: "DUPLICATE", call };

    const next = nextCallState(call, event);
    if (next === null) return { applied: false, reason: "IGNORED", call };
    if (next.inconsistent) return { applied: false, reason: "INCONSISTENT", call };

    const updated = await tx.calls.update(call.id, next.patch, now);
    const finished = TERMINAL_CALL_STATUSES.includes(updated.status) && !TERMINAL_CALL_STATUSES.includes(call.status);
    if (finished) {
      await append(tx, call.leadId, "CALL_ENDED", { actorType: "SYSTEM" }, updated.endedAt ?? event.occurredAt, {
        callId: call.id,
        status: updated.status,
        connected: isConnected(updated),
        ...(isConnected(updated) ? { durationSeconds: updated.durationSeconds ?? 0 } : {}),
      });
      const lead = await tx.leads.getById(call.leadId);
      if (lead && !lead.erasedAt) {
        await tx.leads.update(call.leadId, { lastActivityAt: now }, now);
      }
    }
    return { applied: true, call: updated, finished };
  });
}

// --- the outcome of the conversation --------------------------------------------------------------

/**
 * Records what the call led to — once, by the person who made it (or the Founder), only after the call has finished,
 * and only an outcome consistent with what the provider reported (you cannot say "interested" about a call nobody
 * answered, nor "switched off" about one that connected). Never changes the call's status, times or duration.
 */
export async function setCallDisposition(
  repos: LeadRepositories,
  callId: string,
  disposition: CallDisposition,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadCall> {
  assertWorkingActor(actor);
  if (typeof disposition !== "string" || !(CALL_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw new LeadValidationError("disposition", "Choose what the call led to.");
  }

  return repos.transaction(async (tx) => {
    const call = typeof callId === "string" ? await tx.calls.getById(callId) : null;
    if (!call) throw new LeadNotFoundError("Call not found.");
    const lead = await tx.leads.getById(call.leadId);
    if (!lead) throw new LeadNotFoundError("Call not found.");
    // Ownership of the lead (a foreign lead is "not found") ...
    await guardLeadAction(tx, actor, lead, "PLACE_CALL", now);
    // ... and a team member can only describe a call THEY made. The Founder may do either.
    if (actor.actorType === "EMPLOYEE" && call.staffUserId !== actor.actorId) throw new LeadNotFoundError("Call not found.");

    if (!TERMINAL_CALL_STATUSES.includes(call.status)) throw new LeadStateError("The call has not finished yet.");
    if (call.disposition !== null) throw new LeadStateError("This call already has an outcome. It cannot be changed.");
    const connected = isConnected(call);
    if (DISPOSITIONS_NEEDING_CONNECTION.includes(disposition) && !connected) {
      throw new LeadValidationError("disposition", "That outcome needs a connected call. This call was not answered.");
    }
    if (DISPOSITIONS_FOR_UNCONNECTED.includes(disposition) && connected) {
      throw new LeadValidationError("disposition", "That outcome is for calls that did not connect. This call was answered.");
    }

    const updated = await tx.calls.update(callId, { disposition, dispositionBy: actor.actorId!, dispositionAt: now }, now);
    await append(tx, call.leadId, "CALL_DISPOSITION_SET", actor, now, { callId, disposition });
    if (!lead.erasedAt) await tx.leads.update(call.leadId, { lastActivityAt: now }, now);
    return updated;
  });
}

// --- reads ----------------------------------------------------------------------------------------

/** One call, for an actor allowed to see it: the Founder any; a team member only a call THEY made on a lead they own. Otherwise null. */
export async function getCallForActor(repos: LeadRepositories, actor: LeadActor, callId: string): Promise<LeadCall | null> {
  if (!actor.actorId || (actor.actorType !== "FOUNDER" && actor.actorType !== "EMPLOYEE")) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const call = typeof callId === "string" ? await repos.calls.getById(callId) : null;
  if (!call) return null;
  const lead: Lead | null = await repos.leads.getById(call.leadId);
  if (!lead || !canViewLead(actor, lead)) return null;
  if (actor.actorType === "EMPLOYEE" && call.staffUserId !== actor.actorId) return null;
  return call;
}

export { CONNECTED_CALL_STATUSES };
