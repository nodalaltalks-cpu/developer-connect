import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { assertNoMissedFollowUps } from "./follow-up-service.ts";
import { prepareDeviceCall, type PreparedDeviceCall } from "./call-service.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import { normalizePhone } from "./phone.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Lead, LeadActor } from "./types.ts";

/**
 * COLD CALL: a team member types a number and calls it from their own SIM, with the call counted like any other.
 *
 * No second model: a cold call is an ordinary call attempt (prepareDeviceCall) on an ordinary lead.
 *  - A number already in the system is NEVER duplicated. If the caller may call that lead (they own it, or they are the
 *    Founder) the call attaches to it; if not, they are told only that the number is already in the system and not theirs
 *    to call - never whose it is, never its name.
 *  - A number that is not in the system becomes a COLD_CALL lead (creation method DIALER_GENERATED), owned by the
 *    caller, created visibly - the screen says so - and in the same breath as the call attempt. A wrong number is then
 *    closed with the usual outcome (invalid number), exactly like any lead.
 *  - Everything after the call is the existing path: the phone reports its call-log duration, the SERVER classifies it
 *    (more than 10 seconds = CONNECTED), the caller records an outcome. This module classifies nothing.
 */

export type ColdCallLookup =
  | { kind: "INVALID" }
  /** Not in the system: calling it creates a new self-generated lead owned by the caller. */
  | { kind: "NEW"; e164: string }
  /** In the system and the caller may call it (their own lead, or the Founder). */
  | { kind: "YOURS"; e164: string; leadId: string; leadName: string | null }
  /** In the system, and not the caller's to call. Nothing else is revealed. */
  | { kind: "NOT_YOURS"; e164: string };

/** Normalizes what was typed (Indian numbers by default; a leading + or a country code is respected). */
export function parseColdCallNumber(input: unknown): { ok: true; e164: string } | { ok: false } {
  if (typeof input !== "string" || input.length > 24) return { ok: false };
  const parsed = normalizePhone(input, "IN");
  return parsed.ok ? { ok: true, e164: parsed.e164 } : { ok: false };
}

export async function lookupColdCallNumber(repos: LeadRepositories, input: unknown, actor: LeadActor, now: Date = new Date()): Promise<ColdCallLookup> {
  assertWorkingActor(actor);
  const parsed = parseColdCallNumber(input);
  if (!parsed.ok) return { kind: "INVALID" };
  const lead = await repos.leads.findByPhone(parsed.e164);
  if (!lead) return { kind: "NEW", e164: parsed.e164 };
  // A number that has only ever been cold called is nobody's lead: anyone may call it again, and it is "new" until someone qualifies it.
  if (lead.prospect && !lead.erasedAt) return { kind: "NEW", e164: parsed.e164 };
  if (lead.erasedAt) return { kind: "NOT_YOURS", e164: parsed.e164 };
  try {
    await repos.transaction((tx) => guardLeadAction(tx, actor, lead, "PLACE_CALL", now));
  } catch (error) {
    // The guard answers "not found" for a lead the caller may not touch; either way it is simply not theirs.
    if (error instanceof UnauthorizedLeadActionError || error instanceof LeadNotFoundError) return { kind: "NOT_YOURS", e164: parsed.e164 };
    throw error;
  }
  return { kind: "YOURS", e164: parsed.e164, leadId: lead.id, leadName: lead.name };
}

export interface PreparedColdCall extends PreparedDeviceCall {
  leadId: string;
  /** Always false now: a cold call never creates a lead by itself (see `prospect`). Kept so older callers keep working. */
  createdLead: boolean;
  /** True when the number is only a prospect (called, but not a lead). The employee decides after the call: interested makes it their lead. */
  prospect: boolean;
}

/**
 * An employee marks a cold-called prospect INTERESTED and saves the short details: only now does it become a lead, owned by them.
 * The call history on it (every call anyone made to that number) stays. The missed-follow-up lock applies, exactly as for any new lead.
 */
export async function claimProspect(tx: LeadRepositories, lead: Lead, actor: LeadActor, now: Date): Promise<Lead> {
  if (!lead.prospect) return lead;
  if (lead.erasedAt) throw new LeadNotFoundError("Lead not found.");
  const ownerId = actor.actorType === "EMPLOYEE" ? actor.actorId! : null;
  if (ownerId) await assertNoMissedFollowUps(tx, ownerId, now);
  await tx.events.append({ leadId: lead.id, eventType: "LEAD_CREATED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { via: "COLD_CALL_QUALIFIED" }, createdAt: now });
  if (ownerId) {
    await tx.events.append({ leadId: lead.id, eventType: "OWNER_CHANGED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { from: null, to: ownerId, via: "COLD_CALL_QUALIFIED" }, createdAt: now });
  }
  return tx.leads.update(lead.id, { prospect: false, ownerId, lastActivityAt: now }, now);
}

export async function prepareColdCall(
  repos: LeadRepositories,
  input: { phone: unknown; deviceRef?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<PreparedColdCall> {
  assertWorkingActor(actor);
  const parsed = parseColdCallNumber(input.phone);
  if (!parsed.ok) throw new LeadValidationError("phone", "Enter a valid phone number.");

  let lead = await repos.leads.findByPhone(parsed.e164);
  if (!lead) {
    // The lock: a team member with unresolved missed follow-ups cannot start new work until those are cleared.
    if (actor.actorType === "EMPLOYEE" && actor.actorId) await assertNoMissedFollowUps(repos, actor.actorId, now);
    // A cold call is NOT a lead: the number is kept as a hidden prospect so the call can be recorded and counted. It becomes a lead
    // only when the employee marks the client interested. Anyone may call a prospect, and as many times as they like.
    const made = await repos.leads.upsertByPhone({
      phoneE164: parsed.e164,
      name: null,
      email: null,
      contactPreference: "PHONE_CALL",
      developerId: null,
      sourceCta: null,
      sessionId: null,
      userId: null,
      prospect: true,
      source: { sourceType: "COLD_CALL", sourceDetail: "Cold call", creationMethod: "DIALER_GENERATED", importBatchId: null, createdBy: actor.actorId! },
      now,
    });
    lead = made.lead;
  }

  try {
    const prepared = await prepareDeviceCall(repos, lead.id, actor, { deviceRef: input.deviceRef ?? null }, now);
    return { ...prepared, leadId: lead.id, createdLead: false, prospect: lead.prospect };
  } catch (error) {
    // A lead this person may not call is reported without a hint of whose it is.
    if (error instanceof UnauthorizedLeadActionError || error instanceof LeadNotFoundError) {
      throw new LeadStateError("This number is already in the system and is not assigned to you, so you cannot call it from here.");
    }
    throw error;
  }
}
