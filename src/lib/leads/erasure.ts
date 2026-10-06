import { LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { eraseLead } from "./lead-service.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Lead, LeadActor } from "./types.ts";

/**
 * The founder's operational path for a buyer's erasure request.
 *
 * It is a thin, testable guard around eraseLead (which does the work and is
 * unchanged): the actor must be the FOUNDER (refused before anything is
 * read), and the founder must type the confirmation word, so a stray tap or
 * a replayed request can never erase a lead. Erasure removes personal data
 * and free text but keeps the anonymous history — see eraseLead.
 *
 * There is deliberately no public entry point: only the founder-only server
 * action in app/admin/_actions/lead-actions.ts calls this.
 */

export const ERASE_CONFIRMATION = "ERASE";

export async function eraseLeadOnFounderRequest(
  repos: LeadRepositories,
  leadId: string,
  confirmation: unknown,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Lead> {
  if (actor.actorType !== "FOUNDER") throw new UnauthorizedLeadActionError("Only the founder can erase a lead's personal data.");
  if (typeof confirmation !== "string" || confirmation.trim().toUpperCase() !== ERASE_CONFIRMATION) {
    throw new LeadValidationError("confirmation", `Type ${ERASE_CONFIRMATION} to confirm.`);
  }
  return eraseLead(repos, leadId, actor, now);
}
