import { LeadNotFoundError, UnauthorizedLeadActionError } from "./errors.ts";
import type { Lead, LeadActor } from "./types.ts";

/**
 * WHO MAY SEE AND DO WHAT on a lead — one pure place, so the rule cannot drift between the service, the reads and
 * the screens. Server-side only: nothing here is a UI hint.
 *
 *  - FOUNDER: every lead, every operation (each founder-only service operation also asserts it itself).
 *  - EMPLOYEE: only leads they OWN, never an erased one, and only the day-to-day activity operations in
 *    EMPLOYEE_CAPABILITIES (the four activities, the buyer-requirement workflow, returning a lead they own, and placing/describing calls on it). Status, temperature, bookings,
 *    assignment and erasure stay founder-only.
 *  - BUYER / SYSTEM: never — they have no CRM access at all.
 *
 * A lead an employee may not see looks exactly like a lead that does not exist (LeadNotFoundError): probing ids
 * reveals nothing about which leads exist or who owns them.
 *
 * An EMPLOYEE actor is only ever built by authorizeStaffActor from an ACTIVE staff member, so "inactive" never
 * reaches this layer as an actor.
 */

export const EMPLOYEE_CAPABILITIES = ["ADD_NOTE", "LOG_CONTACT", "SET_FOLLOW_UP", "COMPLETE_FOLLOW_UP", "MANAGE_REQUIREMENT", "RETURN_LEAD", "PLACE_CALL", "SHORTLIST_PROJECT", "MANAGE_SITE_VISIT", "QUALIFY_LEAD"] as const;
export type LeadCapability = (typeof EMPLOYEE_CAPABILITIES)[number];

/** The identity gate for operations a team member may perform: a founder or an employee, with an id. Runs BEFORE any read. */
export function assertWorkingActor(actor: LeadActor): void {
  const working = actor.actorType === "FOUNDER" || actor.actorType === "EMPLOYEE";
  if (!working || !actor.actorId) {
    throw new UnauthorizedLeadActionError("A signed-in team member is required for this lead action.");
  }
}

/** May this actor see this lead at all? */
export function canViewLead(actor: LeadActor, lead: Lead): boolean {
  if (!actor.actorId) return false;
  if (actor.actorType === "FOUNDER") return true;
  if (actor.actorType === "EMPLOYEE") return lead.erasedAt === null && lead.ownerId === actor.actorId;
  return false;
}

/** May this actor perform `capability` on this lead? Throws if not. */
export function assertMayAct(actor: LeadActor, lead: Lead, capability: LeadCapability): void {
  assertWorkingActor(actor);
  if (actor.actorType === "FOUNDER") return;
  if (!(EMPLOYEE_CAPABILITIES as readonly string[]).includes(capability)) {
    throw new UnauthorizedLeadActionError("That lead action is not available to team members.");
  }
  if (!canViewLead(actor, lead)) throw new LeadNotFoundError("Lead not found.");
}
