import type { LeadStatus } from "./types.ts";

/**
 * The qualification vocabulary, as plain constants (no server code), so a client component can import it without pulling in
 * the service. The four outcomes map onto the CANONICAL lead statuses - there is no second status system - and the reason
 * (negotiation, property presentation, ...) is context stored on the event, never a status.
 */

export const QUALIFICATION_OUTCOMES = ["QUALIFIED", "PENDING_QUALIFICATION", "FUTURE_POTENTIAL", "NOT_LOOKING"] as const;
export type QualificationOutcome = (typeof QUALIFICATION_OUTCOMES)[number];

export const QUALIFICATION_REASONS = ["NEGOTIATION", "PROPERTY_PRESENTATION", "REQUIREMENT_GATHERING", "FINALIZED"] as const;
export type QualificationReason = (typeof QUALIFICATION_REASONS)[number];

export const OUTCOME_STATUS: Record<QualificationOutcome, LeadStatus> = {
  QUALIFIED: "QUALIFIED",
  PENDING_QUALIFICATION: "CONTACTED",
  FUTURE_POTENTIAL: "REVISIT_LATER",
  NOT_LOOKING: "NOT_INTERESTED",
};

/** From -> the statuses a TEAM MEMBER may record. A status not listed as a key cannot be moved by a team member here. */
export const EMPLOYEE_TRANSITIONS: Partial<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ["CONTACTED", "QUALIFIED", "REVISIT_LATER", "NOT_INTERESTED"],
  CONTACTED: ["CONTACTED", "QUALIFIED", "REVISIT_LATER", "NOT_INTERESTED"],
  QUALIFIED: ["QUALIFIED", "REVISIT_LATER", "NOT_INTERESTED"],
  REVISIT_LATER: ["REVISIT_LATER", "CONTACTED", "QUALIFIED", "NOT_INTERESTED"],
  NOT_INTERESTED: ["REVISIT_LATER"],
};

export function employeeMayMove(from: LeadStatus, to: LeadStatus): boolean {
  return (EMPLOYEE_TRANSITIONS[from] ?? []).includes(to);
}
