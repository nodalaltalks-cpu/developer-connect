import { locationKey } from "./requirement-locations.ts";
import type { LeadCurrency, LeadRequirement } from "./types.ts";

/**
 * FOUNDATION for future project matching — types and a data-preparation helper only. There is deliberately NO
 * matching engine, NO score and NO percentage here: the product has no project inventory yet, and a number with
 * nothing behind it would be a fake. When project data exists, a matcher implements RequirementMatcher and answers
 * criterion by criterion, so every result can be explained to the Founder, the team member and the buyer.
 *
 *   Buyer requirement → location → budget → configuration → property type → purpose → project
 *
 * Keep this file free of storage and framework imports: it is the contract a later matcher is written against.
 */

export type MatchCriterionName = "LOCATION" | "BUDGET" | "CONFIGURATION" | "PROPERTY_TYPE" | "PURPOSE";

/** MATCH / MISMATCH are decisions; UNKNOWN means the buyer or the project has not said, which is not a mismatch. */
export type MatchOutcome = "MATCH" | "MISMATCH" | "UNKNOWN";

export interface MatchCriterionResult {
  criterion: MatchCriterionName;
  outcome: MatchOutcome;
  /** A plain-language reason a person can read, e.g. "Project is in Thane; buyer asked for Thane and Navi Mumbai". */
  explanation: string;
}

/** A criterion-by-criterion explanation. Intentionally has no aggregate score field. */
export interface MatchExplanation {
  requirementId: string;
  projectId: string;
  criteria: MatchCriterionResult[];
}

/** What the buyer's requirement looks like to a matcher: normalised, no free text, no personal data. */
export interface MatchableRequirement {
  requirementId: string;
  /** Normalised location keys (see locationKey): Bengaluru and Bangalore are the same key. */
  locationKeys: string[];
  propertyType: string | null;
  configuration: string | null;
  budget: { min: number | null; max: number | null; currency: LeadCurrency } | null;
  purpose: LeadRequirement["purpose"];
}

/** The contract a future matcher implements. `Project` is generic because the project model does not exist yet. */
export interface RequirementMatcher<Project> {
  explain(requirement: MatchableRequirement, project: Project): MatchExplanation;
}

/** Prepares a stored requirement for matching: only structured fields, locations as normalised keys. */
export function toMatchableRequirement(requirement: LeadRequirement): MatchableRequirement {
  const hasBudget = requirement.budgetCurrency !== null && (requirement.budgetMin !== null || requirement.budgetMax !== null);
  return {
    requirementId: requirement.id,
    locationKeys: [...new Set(requirement.locations.map(locationKey))],
    propertyType: requirement.propertyType,
    configuration: requirement.configuration,
    budget: hasBudget ? { min: requirement.budgetMin, max: requirement.budgetMax, currency: requirement.budgetCurrency! } : null,
    purpose: requirement.purpose,
  };
}
