import { formatBudget, formatEnumLabel } from "./format.ts";
import type { Lead, LeadRequirement, RequirementInput, RequirementStatus } from "./types.ts";

/**
 * The serialisable shape of a requirement for screens (dates as ISO strings), plus the small pure helpers the
 * requirement section uses. No personal data beyond what the requirement itself holds; framework-free.
 */

export interface RequirementView {
  id: string;
  status: RequirementStatus;
  locations: string[];
  propertyType: string | null;
  configuration: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: LeadRequirement["budgetCurrency"];
  purpose: LeadRequirement["purpose"];
  timeline: LeadRequirement["timeline"];
  notes: string | null;
  updatedAt: string;
  createdAt: string;
}

export function toRequirementView(requirement: LeadRequirement): RequirementView {
  return {
    id: requirement.id,
    status: requirement.status,
    locations: requirement.locations,
    propertyType: requirement.propertyType,
    configuration: requirement.configuration,
    budgetMin: requirement.budgetMin,
    budgetMax: requirement.budgetMax,
    budgetCurrency: requirement.budgetCurrency,
    purpose: requirement.purpose,
    timeline: requirement.timeline,
    notes: requirement.notes,
    updatedAt: requirement.updatedAt.toISOString(),
    createdAt: requirement.createdAt.toISOString(),
  };
}

/** The requirement the screen shows as "current": the ACTIVE one, otherwise one that is ON_HOLD; everything else is history. */
export function splitRequirements(requirements: readonly RequirementView[]): { current: RequirementView | null; history: RequirementView[] } {
  const current = requirements.find((r) => r.status === "ACTIVE") ?? requirements.find((r) => r.status === "ON_HOLD") ?? null;
  return { current, history: requirements.filter((r) => r !== current) };
}

/** The values a "start a requirement" form begins with when the lead already carries details but no structured requirement. */
export function prefillFromLead(lead: Pick<Lead, "location" | "budgetMin" | "budgetMax" | "budgetCurrency" | "configuration" | "propertyType" | "purpose" | "timeline">): RequirementInput {
  return {
    locations: lead.location ? [lead.location] : [],
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    budgetCurrency: lead.budgetCurrency,
    configuration: lead.configuration,
    propertyType: lead.propertyType,
    purpose: lead.purpose,
    timeline: lead.timeline,
  };
}

export function budgetLabel(r: Pick<RequirementView, "budgetMin" | "budgetMax" | "budgetCurrency">): string | null {
  return formatBudget(r.budgetMin, r.budgetMax, r.budgetCurrency)?.replace(/ budget$/, "") ?? null;
}

/** Common residential configurations offered as suggestions; the field still accepts any other text. */
export const CONFIGURATION_SUGGESTIONS = ["1 BHK", "2 BHK", "3 BHK", "4 BHK", "5+ BHK"] as const;
export const PROPERTY_TYPE_SUGGESTIONS = ["Apartment", "Villa", "Plot", "Commercial"] as const;

/** The requirement as one scannable line: "2 BHK · Thane, Navi Mumbai · ₹80 L – ₹1.2 Cr · Self use". Null when nothing is recorded. */
export function requirementOneLine(requirement: Pick<LeadRequirement, "configuration" | "locations" | "budgetMin" | "budgetMax" | "budgetCurrency" | "purpose">): string | null {
  const parts = [
    requirement.configuration,
    requirement.locations.length ? requirement.locations.join(", ") : null,
    budgetLabel(requirement),
    requirement.purpose ? formatEnumLabel(requirement.purpose) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}
