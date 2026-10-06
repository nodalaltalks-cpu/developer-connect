import { LeadNotFoundError, LeadStateError, LeadValidationError } from "./errors.ts";
import { assertWorkingActor, canViewLead } from "./lead-access.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { normalizeLocations } from "./requirement-locations.ts";
import type { LeadRepositories, RequirementLocation, RequirementPatch } from "./repository.ts";
import {
  LEAD_CURRENCIES,
  LEAD_PURPOSES,
  LEAD_TIMELINES,
  REQUIREMENT_STATUSES,
  type Lead,
  type LeadActor,
  type LeadCurrency,
  type LeadEventType,
  type LeadRequirement,
  type RequirementInput,
  type RequirementStatus,
} from "./types.ts";

/**
 * The buyer-requirement domain service (Phase 2, Step 3). Framework-free; authorization is enforced HERE, in the
 * service, not only by the pages that call it:
 *
 *  - FOUNDER: any lead.
 *  - EMPLOYEE: only a lead they own (and never an erased one), through the MANAGE_REQUIREMENT capability. A lead
 *    that is not theirs looks exactly like a lead that does not exist.
 *  - everyone else: refused before any read.
 *
 * Model: a lead has a HISTORY of requirements and at most one is ACTIVE. Starting a new requirement while one is
 * active CLOSES the previous one (its row is kept, never overwritten). Every change appends an immutable event with
 * who and when; event payloads carry ids, enums and numbers only — never locations or notes (free text), so
 * erasure has nothing to scrub. The active requirement's summary is mirrored onto the lead's own requirement
 * columns in the same transaction, so the lead card, Today queue and Founder CRM keep reading what they always read.
 */

const MAX_BUDGET = 100_000_000_000;
const MAX_SHORT_TEXT = 60;
const MAX_NOTES = 2000;

const SCALAR_FIELDS = ["propertyType", "configuration", "budgetMin", "budgetMax", "budgetCurrency", "purpose", "timeline"] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];

interface ValidatedRequirement {
  locations: RequirementLocation[];
  propertyType: string | null;
  configuration: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: LeadCurrency | null;
  purpose: LeadRequirement["purpose"];
  timeline: LeadRequirement["timeline"];
  notes: string | null;
}

function shortText(field: string, value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new LeadValidationError(field, `${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new LeadValidationError(field, `${field} is too long (max ${max} characters).`);
  return trimmed;
}

function amount(field: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_BUDGET) {
    throw new LeadValidationError(field, `${field} must be a whole number of 0 or more.`);
  }
  return value;
}

function choice<T extends string>(field: string, value: unknown, allowed: readonly T[]): T | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new LeadValidationError(field, `${field} is not a valid choice.`);
  }
  return value as T;
}

/** Validates a COMPLETE requirement (every field is taken as given; an omitted field means "not said"). */
export function validateRequirementInput(input: RequirementInput): ValidatedRequirement {
  if (!input || typeof input !== "object") throw new LeadValidationError("requirement", "Requirement details are required.");
  const validated: ValidatedRequirement = {
    locations: normalizeLocations(input.locations),
    propertyType: shortText("propertyType", input.propertyType, MAX_SHORT_TEXT),
    configuration: shortText("configuration", input.configuration, MAX_SHORT_TEXT),
    budgetMin: amount("budgetMin", input.budgetMin),
    budgetMax: amount("budgetMax", input.budgetMax),
    budgetCurrency: choice("budgetCurrency", input.budgetCurrency, LEAD_CURRENCIES),
    purpose: choice("purpose", input.purpose, LEAD_PURPOSES),
    timeline: choice("timeline", input.timeline, LEAD_TIMELINES),
    notes: shortText("notes", input.notes, MAX_NOTES),
  };
  if (validated.budgetMin !== null && validated.budgetMax !== null && validated.budgetMin > validated.budgetMax) {
    throw new LeadValidationError("budgetMin", "The minimum budget cannot be higher than the maximum.");
  }
  if ((validated.budgetMin !== null || validated.budgetMax !== null) && validated.budgetCurrency === null) {
    throw new LeadValidationError("budgetCurrency", "Choose a currency for the budget.");
  }
  return validated;
}

// --- helpers --------------------------------------------------------------------------------------

async function loadLeadFor(tx: LeadRepositories, actor: LeadActor, leadId: string, now: Date): Promise<Lead> {
  const lead = await tx.leads.getById(leadId);
  if (!lead) throw new LeadNotFoundError("Lead not found.");
  // Ownership/erasure for team members is decided here, inside the transaction; a foreign lead is "not found".
  await guardLeadAction(tx, actor, lead, "MANAGE_REQUIREMENT", now);
  if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased and it can no longer be changed.");
  return lead;
}

/** A requirement that is not on this lead is "not found" — a requirement id from another lead is never usable (IDOR). */
async function loadRequirementOf(tx: LeadRepositories, leadId: string, requirementId: string): Promise<LeadRequirement> {
  if (typeof requirementId !== "string") throw new LeadNotFoundError("Requirement not found.");
  const requirement = await tx.requirements.getById(requirementId);
  if (!requirement || requirement.leadId !== leadId) throw new LeadNotFoundError("Requirement not found.");
  return requirement;
}

async function appendEvent(
  tx: LeadRepositories,
  leadId: string,
  eventType: LeadEventType,
  actor: LeadActor,
  now: Date,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.events.append({
    leadId,
    eventType,
    actorType: actor.actorType,
    actorId: actor.actorId ?? null,
    developerId: null,
    fromStatus: null,
    toStatus: null,
    payload,
    createdAt: now,
  });
}

/** Locations as one display string for the lead's own `location` column; falls back to the first when too long. */
function mirrorLocation(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const joined = locations.join(", ");
  return joined.length <= 120 ? joined : locations[0];
}

/** Copies the ACTIVE requirement's summary onto the lead (same transaction), so existing screens keep working. */
async function mirrorToLead(tx: LeadRepositories, lead: Lead, requirement: LeadRequirement, now: Date): Promise<void> {
  await tx.leads.update(
    lead.id,
    {
      location: mirrorLocation(requirement.locations),
      budgetMin: requirement.budgetMin,
      budgetMax: requirement.budgetMax,
      budgetCurrency: requirement.budgetCurrency,
      configuration: requirement.configuration,
      propertyType: requirement.propertyType,
      purpose: requirement.purpose,
      timeline: requirement.timeline,
      lastActivityAt: now,
    },
    now,
  );
}

const sameLocations = (a: string[], b: RequirementLocation[]) => a.length === b.length && a.every((name, i) => name === b[i].name);

// --- operations -----------------------------------------------------------------------------------

/**
 * Starts a new ACTIVE requirement for a lead. If the lead already has an active one it is CLOSED first (kept as
 * history, with a status event). Founder, or the employee who owns the lead.
 */
export async function createRequirement(
  repos: LeadRepositories,
  leadId: string,
  input: RequirementInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadRequirement> {
  assertWorkingActor(actor);
  const validated = validateRequirementInput(input);

  return repos.transaction(async (tx) => {
    const lead = await loadLeadFor(tx, actor, leadId, now);
    const actorId = actor.actorId!;

    const current = await tx.requirements.getActiveByLead(leadId);
    if (current) {
      await tx.requirements.update(current.id, { status: "CLOSED", updatedBy: actorId }, now);
      await appendEvent(tx, leadId, "REQUIREMENT_STATUS_CHANGED", actor, now, {
        requirementId: current.id,
        from: "ACTIVE",
        to: "CLOSED",
        reason: "SUPERSEDED",
      });
    }

    const created = await tx.requirements.create({ leadId, ...validated, createdBy: actorId, now });
    await appendEvent(tx, leadId, "REQUIREMENT_CREATED", actor, now, {
      requirementId: created.id,
      ...(current ? { supersededRequirementId: current.id } : {}),
    });
    await mirrorToLead(tx, lead, created, now);
    return created;
  });
}

/**
 * Updates an ACTIVE or ON_HOLD requirement with a complete new set of details. Only what actually changed is
 * recorded (field names and, for numbers/choices, from/to; never locations or notes). A no-op changes nothing and
 * writes nothing. A closed or fulfilled requirement is history: start a new one instead.
 */
export async function updateRequirementDetails(
  repos: LeadRepositories,
  leadId: string,
  requirementId: string,
  input: RequirementInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<{ requirement: LeadRequirement; changed: string[] }> {
  assertWorkingActor(actor);
  const validated = validateRequirementInput(input);

  return repos.transaction(async (tx) => {
    const lead = await loadLeadFor(tx, actor, leadId, now);
    const current = await loadRequirementOf(tx, leadId, requirementId);
    if (current.status === "CLOSED" || current.status === "FULFILLED") {
      throw new LeadStateError("A closed or fulfilled requirement is history. Start a new requirement instead.");
    }

    const patch: RequirementPatch = { updatedBy: actor.actorId! };
    const fields: Record<string, { from?: unknown; to?: unknown; changed?: true }> = {};
    for (const field of SCALAR_FIELDS) {
      const next = validated[field as ScalarField];
      if (next !== current[field as ScalarField]) {
        (patch as Record<string, unknown>)[field] = next;
        fields[field] = { from: current[field as ScalarField], to: next };
      }
    }
    if (validated.notes !== current.notes) {
      patch.notes = validated.notes;
      fields.notes = { changed: true };
    }
    const locationsChanged = !sameLocations(current.locations, validated.locations);
    if (locationsChanged) fields.locations = { changed: true };

    const changed = Object.keys(fields);
    if (changed.length === 0) return { requirement: current, changed };

    const updated = await tx.requirements.update(current.id, patch, now, locationsChanged ? validated.locations : undefined);
    await appendEvent(tx, leadId, "REQUIREMENT_UPDATED", actor, now, { requirementId: current.id, fields });
    if (updated.status === "ACTIVE") await mirrorToLead(tx, lead, updated, now);
    else await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return { requirement: updated, changed };
  });
}

/** Moves a requirement between ACTIVE, ON_HOLD, FULFILLED and CLOSED. Making one ACTIVE needs no other active requirement. */
export async function setRequirementStatus(
  repos: LeadRepositories,
  leadId: string,
  requirementId: string,
  status: RequirementStatus,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadRequirement> {
  assertWorkingActor(actor);
  if (typeof status !== "string" || !(REQUIREMENT_STATUSES as readonly string[]).includes(status)) {
    throw new LeadValidationError("status", "That requirement status does not exist.");
  }

  return repos.transaction(async (tx) => {
    const lead = await loadLeadFor(tx, actor, leadId, now);
    const current = await loadRequirementOf(tx, leadId, requirementId);
    if (current.status === status) throw new LeadStateError("The requirement already has that status.");
    if (status === "ACTIVE") {
      const other = await tx.requirements.getActiveByLead(leadId);
      if (other && other.id !== current.id) {
        throw new LeadStateError("Another requirement is already active. Close it first, or update that one.");
      }
    }

    const updated = await tx.requirements.update(current.id, { status, updatedBy: actor.actorId! }, now);
    await appendEvent(tx, leadId, "REQUIREMENT_STATUS_CHANGED", actor, now, { requirementId: current.id, from: current.status, to: status });
    if (status === "ACTIVE") await mirrorToLead(tx, lead, updated, now);
    else await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return updated;
  });
}

// --- reads ----------------------------------------------------------------------------------------

/** The lead's whole requirement history, newest first, for an actor allowed to see the lead (otherwise null — same as a missing lead). */
export async function listRequirementsForActor(repos: LeadRepositories, actor: LeadActor, leadId: string): Promise<LeadRequirement[] | null> {
  const lead = await repos.leads.getById(leadId);
  if (!lead) return null;
  if (!canViewLead(actor, lead)) return null;
  return repos.requirements.listByLead(leadId);
}

/** The current requirement: the ACTIVE one, else null. */
export function currentRequirement(requirements: readonly LeadRequirement[]): LeadRequirement | null {
  return requirements.find((requirement) => requirement.status === "ACTIVE") ?? null;
}
