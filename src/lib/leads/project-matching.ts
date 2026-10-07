import type { LeadRequirement, Project } from "./types.ts";

/**
 * EXPLAINABLE requirement-to-project matching. Pure, deterministic, no scoring and no AI.
 *
 * Each criterion is exactly one of:
 *   MATCH     - both sides state a value and they agree
 *   MISMATCH  - both sides state a value and they disagree
 *   UNKNOWN   - at least one side has not said (or the money is in different currencies, which is never converted)
 * and always carries a plain-language reason, so a team member can see WHY and nothing is implied that is not known.
 *
 * Overall: any MISMATCH -> MISMATCH; otherwise MATCH only when every criterion is a MATCH; otherwise UNKNOWN.
 *
 * What is compared today: location, property type, configuration, budget. Purpose and timeline are about the buyer,
 * not the project, so they are deliberately not matched. Anything the project record does not hold is UNKNOWN.
 */

export type MatchResult = "MATCH" | "MISMATCH" | "UNKNOWN";
export type CriterionKey = "location" | "propertyType" | "configuration" | "budget";

export interface MatchCriterion {
  key: CriterionKey;
  label: string;
  result: MatchResult;
  reason: string;
}

export interface ProjectMatch {
  projectId: string;
  overall: MatchResult;
  criteria: MatchCriterion[];
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function matchLocation(req: Pick<LeadRequirement, "locations">, project: Pick<Project, "city" | "locality">): MatchCriterion {
  const label = "Location";
  const wanted = req.locations.map(norm).filter(Boolean);
  if (wanted.length === 0) return { key: "location", label, result: "UNKNOWN", reason: "The buyer has not named a location." };
  const projectPlaces = [project.city, project.locality].filter((v): v is string => !!v && v.trim() !== "").map(norm);
  // A requirement location may be a city ("Thane") or a place inside it ("Thane, Navi Mumbai"): either side containing the other counts.
  const hit = wanted.find((w) => projectPlaces.some((p) => w === p || w.includes(p) || p.includes(w)));
  if (hit) return { key: "location", label, result: "MATCH", reason: `The project is in ${project.locality ? `${project.locality}, ` : ""}${project.city}, which the buyer listed.` };
  return { key: "location", label, result: "MISMATCH", reason: `The project is in ${project.city}; the buyer asked for ${req.locations.join(", ")}.` };
}

function matchPropertyType(req: Pick<LeadRequirement, "propertyType">, project: Pick<Project, "propertyType">): MatchCriterion {
  const label = "Property type";
  if (!req.propertyType) return { key: "propertyType", label, result: "UNKNOWN", reason: "The buyer has not said which property type." };
  if (!project.propertyType) return { key: "propertyType", label, result: "UNKNOWN", reason: "The project's property type is not recorded." };
  return norm(req.propertyType) === norm(project.propertyType)
    ? { key: "propertyType", label, result: "MATCH", reason: `Both are ${project.propertyType}.` }
    : { key: "propertyType", label, result: "MISMATCH", reason: `The project is ${project.propertyType}; the buyer wants ${req.propertyType}.` };
}

function matchConfiguration(req: Pick<LeadRequirement, "configuration">, project: Pick<Project, "configurations">): MatchCriterion {
  const label = "Configuration";
  if (!req.configuration) return { key: "configuration", label, result: "UNKNOWN", reason: "The buyer has not said which configuration." };
  if (project.configurations.length === 0) return { key: "configuration", label, result: "UNKNOWN", reason: "The project's configurations are not recorded." };
  return project.configurations.some((c) => norm(c) === norm(req.configuration!))
    ? { key: "configuration", label, result: "MATCH", reason: `The project offers ${req.configuration}.` }
    : { key: "configuration", label, result: "MISMATCH", reason: `The project offers ${project.configurations.join(", ")}; the buyer wants ${req.configuration}.` };
}

function matchBudget(req: Pick<LeadRequirement, "budgetMin" | "budgetMax" | "budgetCurrency">, project: Pick<Project, "priceMin" | "priceMax" | "currency">): MatchCriterion {
  const label = "Budget";
  const wantsBudget = req.budgetMin !== null || req.budgetMax !== null;
  if (!wantsBudget) return { key: "budget", label, result: "UNKNOWN", reason: "The buyer has not given a budget." };
  if (project.priceMin === null && project.priceMax === null) return { key: "budget", label, result: "UNKNOWN", reason: "The project's price is not recorded." };
  if (!req.budgetCurrency || !project.currency) return { key: "budget", label, result: "UNKNOWN", reason: "A currency is missing, so the amounts cannot be compared." };
  if (req.budgetCurrency !== project.currency) return { key: "budget", label, result: "UNKNOWN", reason: `The buyer's budget is in ${req.budgetCurrency} and the project is priced in ${project.currency}; currencies are never converted.` };
  const buyerLow = req.budgetMin ?? 0;
  const buyerHigh = req.budgetMax ?? Number.POSITIVE_INFINITY;
  const projectLow = project.priceMin ?? project.priceMax!;
  const projectHigh = project.priceMax ?? project.priceMin!;
  return projectLow <= buyerHigh && projectHigh >= buyerLow
    ? { key: "budget", label, result: "MATCH", reason: "The project's price range overlaps the buyer's budget." }
    : { key: "budget", label, result: "MISMATCH", reason: projectLow > buyerHigh ? "The project costs more than the buyer's budget." : "The project costs less than the buyer's stated minimum." };
}

export function overallOf(criteria: readonly MatchCriterion[]): MatchResult {
  if (criteria.some((c) => c.result === "MISMATCH")) return "MISMATCH";
  return criteria.every((c) => c.result === "MATCH") ? "MATCH" : "UNKNOWN";
}

export function matchRequirementToProject(req: LeadRequirement, project: Project): ProjectMatch {
  const criteria = [matchLocation(req, project), matchPropertyType(req, project), matchConfiguration(req, project), matchBudget(req, project)];
  return { projectId: project.id, overall: overallOf(criteria), criteria };
}

const ORDER: Record<MatchResult, number> = { MATCH: 0, UNKNOWN: 1, MISMATCH: 2 };

/** Best first: MATCH, then UNKNOWN (with more criteria confirmed first), then MISMATCH. Stable by project name. */
export function rankMatches<T extends { match: ProjectMatch; project: Pick<Project, "name"> }>(items: T[]): T[] {
  const matched = (m: ProjectMatch) => m.criteria.filter((c) => c.result === "MATCH").length;
  return [...items].sort((a, b) => ORDER[a.match.overall] - ORDER[b.match.overall] || matched(b.match) - matched(a.match) || a.project.name.localeCompare(b.project.name));
}
