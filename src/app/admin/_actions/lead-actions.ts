"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { LeadNotFoundError, LeadStateError, LeadValidationError } from "@/lib/leads/errors";
import {
  addNote,
  changeLeadStatus,
  completeFollowUp,
  logContact,
  setFollowUp,
  setTemperature,
  updateRequirement,
  type ContactChannel,
  type ContactOutcome,
  type LostReasonCode,
} from "@/lib/leads/lead-service";
import type { LeadActor, LeadStatus, LeadTemperature, Requirement } from "@/lib/leads/types";

/**
 * Founder-only lead actions for the CRM screens. Every function calls
 * requireFounderForAction FIRST — a Server Action is its own network-callable
 * endpoint, so a hidden button is never the only thing between a non-founder
 * and a mutation — and the lead service then refuses any non-FOUNDER actor
 * a second time. The actor is built here, on the server, from the verified
 * session; nothing about "who" ever comes from the browser.
 *
 * Nothing here deletes anything: every change appends to the lead's
 * immutable timeline. Results carry a short, user-safe message — never a
 * stack trace, a phone number or a note's text.
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

/** `dueAtIso` null clears the follow-up. */
export async function setLeadFollowUpAction(leadId: string, dueAtIso: string | null, note?: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => {
    const when = dueAtIso === null ? null : new Date(dueAtIso);
    return setFollowUp(createPostgresLeadRepositories(), leadId, when, actor, new Date(), { note });
  });
}

export async function completeLeadFollowUpAction(leadId: string, note?: string): Promise<LeadActionResult> {
  return run(leadId, (actor) => completeFollowUp(createPostgresLeadRepositories(), leadId, actor, new Date(), { note }));
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
