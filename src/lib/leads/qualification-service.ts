import { LeadNotFoundError, LeadStateError, LeadValidationError } from "./errors.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Lead, LeadActor } from "./types.ts";

/**
 * QUALIFICATION: the one way a team member moves a lead's status.
 *
 * `changeLeadStatus` stays Founder-only. A team member may only RECORD A QUALIFICATION on a lead they own, and each
 * outcome maps onto the canonical status model - there is no second status system:
 *
 *   QUALIFIED              -> QUALIFIED
 *   PENDING_QUALIFICATION  -> CONTACTED
 *   FUTURE_POTENTIAL       -> REVISIT_LATER
 *   NOT_LOOKING            -> NOT_INTERESTED
 *
 * and only along the transitions in EMPLOYEE_TRANSITIONS: forward through the early pipeline, or out to the two "not now"
 * states. Everything later (shortlisted, site visit, negotiation, booked) is moved by real events or by the Founder;
 * LOST, WRONG_NUMBER, UNQUALIFIED, DUPLICATE and CLOSED are never a team member's call here.
 *
 * The reason (negotiation, property presentation, requirement gathering, finalized) is CONTEXT, stored on the
 * QUALIFICATION_RECORDED event. It never replaces or becomes the status. Every call writes immutable events: a
 * STATUS_CHANGED when the status moves, and a QUALIFICATION_RECORDED always (so re-qualifying with a new reason is
 * recorded even when the status stays the same).
 */

export { QUALIFICATION_OUTCOMES, QUALIFICATION_REASONS, OUTCOME_STATUS, EMPLOYEE_TRANSITIONS, employeeMayMove, type QualificationOutcome, type QualificationReason } from "./qualification-model.ts";
import { OUTCOME_STATUS, QUALIFICATION_OUTCOMES, QUALIFICATION_REASONS, employeeMayMove, type QualificationOutcome, type QualificationReason } from "./qualification-model.ts";

export interface QualificationInput {
  outcome: unknown;
  reason?: unknown;
}

export function parseQualification(input: QualificationInput): { outcome: QualificationOutcome; reason: QualificationReason | null } {
  if (typeof input.outcome !== "string" || !(QUALIFICATION_OUTCOMES as readonly string[]).includes(input.outcome)) {
    throw new LeadValidationError("outcome", "Choose Qualified, Pending qualification, Future potential or Not looking right now.");
  }
  const outcome = input.outcome as QualificationOutcome;
  if (input.reason === undefined || input.reason === null || input.reason === "") return { outcome, reason: null };
  if (typeof input.reason !== "string" || !(QUALIFICATION_REASONS as readonly string[]).includes(input.reason)) {
    throw new LeadValidationError("reason", "Choose one of the listed reasons.");
  }
  if (outcome !== "QUALIFIED") throw new LeadValidationError("reason", "A reason applies only to a qualified lead.");
  return { outcome, reason: input.reason as QualificationReason };
}

/** Records a qualification on a lead the actor may act on. Returns the lead and whether its status moved. */
export async function recordQualification(
  repos: LeadRepositories,
  leadId: string,
  input: QualificationInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<{ lead: Lead; statusChanged: boolean }> {
  assertWorkingActor(actor);
  const { outcome, reason } = parseQualification(input);
  const target = OUTCOME_STATUS[outcome];

  return repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "QUALIFY_LEAD", now);
    if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased and it can no longer be changed.");
    if (actor.actorType === "EMPLOYEE" && !employeeMayMove(lead.status, target)) {
      throw new LeadStateError("This lead is already past qualification, or its status is the Founder's to change.");
    }

    const statusChanged = lead.status !== target;
    if (statusChanged) {
      await tx.events.append({
        leadId, eventType: "STATUS_CHANGED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null,
        fromStatus: lead.status, toStatus: target, payload: { via: "QUALIFICATION" }, createdAt: now,
      });
    }
    await tx.events.append({
      leadId, eventType: "QUALIFICATION_RECORDED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null,
      fromStatus: statusChanged ? lead.status : null, toStatus: statusChanged ? target : null,
      payload: { outcome, ...(reason ? { reason } : {}) }, createdAt: now,
    });
    const updated = await tx.leads.update(leadId, { status: target, lastActivityAt: now }, now);
    return { lead: updated, statusChanged };
  });
}
