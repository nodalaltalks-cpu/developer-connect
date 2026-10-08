import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { assertNoMissedFollowUps } from "./follow-up-service.ts";
import { prepareDeviceCall, type PreparedDeviceCall } from "./call-service.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import { createSelfGeneratedLead } from "./lead-import-service.ts";
import { normalizePhone } from "./phone.ts";
import type { LeadRepositories } from "./repository.ts";
import type { LeadActor } from "./types.ts";

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
  /** True when this call created the lead (the number was not in the system). */
  createdLead: boolean;
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
  let createdLead = false;
  if (!lead) {
    // The lock: a team member with unresolved missed follow-ups cannot start a new lead until those are cleared.
    if (actor.actorType === "EMPLOYEE" && actor.actorId) await assertNoMissedFollowUps(repos, actor.actorId, now);
    const made = await createSelfGeneratedLead(repos, { phone: parsed.e164, creationMethod: "DIALER_GENERATED", sourceDetail: "Cold call" }, actor, now);
    if (made.created) {
      lead = made.lead;
      createdLead = true;
    } else {
      // Someone added the same number a moment ago: use theirs, never a second lead.
      lead = await repos.leads.findByPhone(parsed.e164);
    }
  }
  if (!lead) throw new LeadStateError("That number could not be prepared. Please try again.");

  try {
    const prepared = await prepareDeviceCall(repos, lead.id, actor, { deviceRef: input.deviceRef ?? null }, now);
    return { ...prepared, leadId: lead.id, createdLead };
  } catch (error) {
    // A lead this person may not call is reported without a hint of whose it is.
    if (error instanceof UnauthorizedLeadActionError || error instanceof LeadNotFoundError) {
      throw new LeadStateError("This number is already in the system and is not assigned to you, so you cannot call it from here.");
    }
    throw error;
  }
}
