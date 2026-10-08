import { LeadNotFoundError, LeadValidationError } from "./errors.ts";
import { lookupColdCallNumber, parseColdCallNumber } from "./cold-call-service.ts";
import { guardLeadAction, scheduleFollowUp } from "./follow-up-service.ts";
import { assertWorkingActor } from "./lead-access.ts";
import { createSelfGeneratedLead } from "./lead-import-service.ts";
import { addNote } from "./lead-service.ts";
import { shortlistProject } from "./project-service.ts";
import { parseQualification, recordQualification, type QualificationOutcome, type QualificationReason } from "./qualification-service.ts";
import { createRequirement, updateRequirementDetails } from "./requirement-service.ts";
import { scheduleSiteVisit } from "./site-visit-service.ts";
import type { LeadRepositories } from "./repository.ts";
import type { FollowUpType, LeadActor, RequirementInput } from "./types.ts";

/**
 * THE COLD CALL INTAKE: everything an employee records after (or instead of) a cold call, saved in ONE transaction.
 *
 * It is a composition of the existing, tested services - there is no new lead model and no second activity system:
 *   contact fill-in      -> the lead's own name/email, only where they are empty, recorded as an event
 *   interest/qualify     -> recordQualification (canonical status + immutable events)
 *   requirement          -> requirement-service (the one-active-requirement rule is respected: update, else create)
 *   interested projects  -> the project shortlist, WITHOUT advancing the pipeline (the qualification stays the status)
 *   plan / next action   -> follow-up (call, WhatsApp, meeting, video call) or a site visit; never a date on the lead
 *   note                 -> the canonical note event
 * If ANY step fails, NOTHING is saved: a half-saved cold call can never exist.
 *
 * The lead is either an existing one the caller may act on (after a dialed call) or a NEW cold-call lead created here from a
 * typed number. A number already in the system is never duplicated and never described to someone it is not theirs.
 */

export const INTEREST_CHOICES = ["INTERESTED", "NOT_LOOKING"] as const;
export const PLAN_KINDS = ["CALL", "WHATSAPP", "SITE_VISIT", "MEETING", "VIDEO_CALL"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const MAX_INTEREST_PROJECTS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ColdCallLeadInput {
  /** An existing lead the caller may act on. Absent = create a new cold-call lead from `phone`. */
  leadId?: unknown;
  phone?: unknown;
  name?: unknown;
  email?: unknown;
  interest: unknown;
  qualification?: { outcome?: unknown; reason?: unknown } | null;
  projectIds?: unknown;
  plan?: { kind?: unknown; scheduledAt?: unknown; note?: unknown } | null;
  requirement?: RequirementInput | null;
  note?: unknown;
}

export type ColdCallLeadResult =
  | { saved: true; leadId: string; createdLead: boolean; projects: number; planned: PlanKind | null; requirementSaved: boolean; noteAdded: boolean }
  | { saved: false; reason: "EXISTS_YOURS"; leadId: string; leadName: string | null }
  | { saved: false; reason: "EXISTS_NOT_YOURS" };

const FOLLOW_UP_TYPE: Record<Exclude<PlanKind, "SITE_VISIT">, { type: FollowUpType; prefix: string | null }> = {
  CALL: { type: "CALL_BACK", prefix: null },
  WHATSAPP: { type: "WHATSAPP_FOLLOW_UP", prefix: null },
  MEETING: { type: "GENERAL_FOLLOW_UP", prefix: "Meeting" },
  VIDEO_CALL: { type: "GENERAL_FOLLOW_UP", prefix: "Video call" },
};

function cleanText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new LeadValidationError(field, "That is not valid text.");
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new LeadValidationError(field, `Keep this under ${max} characters.`);
  return text;
}

function hasRequirementContent(r: RequirementInput | null | undefined): r is RequirementInput {
  if (!r) return false;
  return Boolean((r.locations && r.locations.length) || r.propertyType || r.configuration || r.budgetMin != null || r.budgetMax != null || r.purpose || r.timeline);
}

export async function saveColdCallLead(repos: LeadRepositories, input: ColdCallLeadInput, actor: LeadActor, now: Date = new Date()): Promise<ColdCallLeadResult> {
  assertWorkingActor(actor);

  // ---- validate everything BEFORE touching the database -----------------------------------------------------------
  if (typeof input.interest !== "string" || !(INTEREST_CHOICES as readonly string[]).includes(input.interest)) {
    throw new LeadValidationError("interest", "Choose Interested or Not looking right now.");
  }
  const interested = input.interest === "INTERESTED";
  const name = cleanText(input.name, "name", 120);
  const email = cleanText(input.email, "email", 254);
  if (email && !EMAIL.test(email)) throw new LeadValidationError("email", "Enter a valid email address.");
  const note = cleanText(input.note, "note", 2000);

  let outcome: QualificationOutcome;
  let reason: QualificationReason | null = null;
  if (interested) {
    const parsed = parseQualification({ outcome: input.qualification?.outcome, reason: input.qualification?.reason });
    if (parsed.outcome === "NOT_LOOKING") throw new LeadValidationError("qualification", "Choose Qualified, Pending qualification or Future potential for an interested client.");
    outcome = parsed.outcome;
    reason = parsed.reason;
  } else {
    outcome = "NOT_LOOKING";
  }

  const rawProjects = Array.isArray(input.projectIds) ? input.projectIds : input.projectIds === undefined || input.projectIds === null ? [] : null;
  if (!rawProjects) throw new LeadValidationError("projectIds", "Choose projects from the list.");
  const projectIds = [...new Set(rawProjects.map((id) => (typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null)))];
  if (projectIds.some((id) => id === null)) throw new LeadValidationError("projectIds", "Choose projects from the list.");
  if (projectIds.length > MAX_INTEREST_PROJECTS) throw new LeadValidationError("projectIds", `Choose at most ${MAX_INTEREST_PROJECTS} projects.`);

  let plan: { kind: PlanKind; scheduledAt: Date; note: string | null } | null = null;
  if (input.plan) {
    const kind = input.plan.kind;
    if (typeof kind !== "string" || !(PLAN_KINDS as readonly string[]).includes(kind)) throw new LeadValidationError("plan", "Choose a next step from the list.");
    const at = input.plan.scheduledAt;
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new LeadValidationError("scheduledAt", "Choose a date and time for the next step.");
    plan = { kind: kind as PlanKind, scheduledAt: at, note: cleanText(input.plan.note, "planNote", 500) };
  }
  if (!interested && (projectIds.length > 0 || plan || hasRequirementContent(input.requirement))) {
    throw new LeadValidationError("interest", "A client who is not looking right now has no projects, plan or requirement to record. Add a note instead.");
  }
  if (plan?.kind === "SITE_VISIT" && projectIds.length === 0) throw new LeadValidationError("plan", "Choose the project for the site visit.");

  const ids = projectIds as string[];

  // ---- one transaction: all of it, or none of it ------------------------------------------------------------------------
  return repos.transaction(async (tx): Promise<ColdCallLeadResult> => {
    let leadId: string;
    let createdLead = false;

    if (typeof input.leadId === "string" && input.leadId) {
      if (!UUID.test(input.leadId)) throw new LeadNotFoundError("Lead not found.");
      const lead = await tx.leads.getById(input.leadId);
      if (!lead) throw new LeadNotFoundError("Lead not found.");
      await guardLeadAction(tx, actor, lead, "QUALIFY_LEAD", now); // a lead the caller may not act on looks like a lead that does not exist
      leadId = lead.id;
    } else {
      const parsed = parseColdCallNumber(input.phone);
      if (!parsed.ok) throw new LeadValidationError("phone", "Enter a valid phone number.");
      const existing = await lookupColdCallNumber(tx, parsed.e164, actor, now);
      if (existing.kind === "YOURS") return { saved: false, reason: "EXISTS_YOURS", leadId: existing.leadId, leadName: existing.leadName };
      if (existing.kind === "NOT_YOURS") return { saved: false, reason: "EXISTS_NOT_YOURS" };
      const made = await createSelfGeneratedLead(tx, { phone: parsed.e164, name, email, creationMethod: "COLD_CALLING", sourceDetail: "Cold call" }, actor, now);
      if (!made.created) {
        // Someone added the same number a moment ago: report it, never create a second lead.
        const again = await lookupColdCallNumber(tx, parsed.e164, actor, now);
        return again.kind === "YOURS" ? { saved: false, reason: "EXISTS_YOURS", leadId: again.leadId, leadName: again.leadName } : { saved: false, reason: "EXISTS_NOT_YOURS" };
      }
      leadId = made.lead.id;
      createdLead = true;
    }

    // Fill in a missing name/email on an existing lead (never overwrite what is there; the phone never changes).
    if (!createdLead && (name || email)) {
      const lead = (await tx.leads.getById(leadId))!;
      const patch: { name?: string; email?: string } = {};
      const fields: string[] = [];
      if (name && !lead.name) { patch.name = name; fields.push("name"); }
      if (email && !lead.email) { patch.email = email.toLowerCase(); fields.push("email"); }
      if (fields.length > 0) {
        await tx.leads.update(leadId, { ...patch, lastActivityAt: now }, now);
        await tx.events.append({ leadId, eventType: "CONTACT_DETAILS_UPDATED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { fields }, createdAt: now });
      }
    }

    // Qualification first: it decides the status. (Interested projects below never advance the pipeline.)
    await recordQualification(tx, leadId, { outcome, reason }, actor, now);

    let requirementSaved = false;
    if (interested && hasRequirementContent(input.requirement)) {
      const active = await tx.requirements.getActiveByLead(leadId);
      if (active) await updateRequirementDetails(tx, leadId, active.id, input.requirement, actor, now);
      else await createRequirement(tx, leadId, input.requirement, actor, now);
      requirementSaved = true;
    }

    for (const projectId of ids) {
      // Already on this lead's active shortlist (an existing lead): leave it, do not fail the whole save.
      const active = await tx.shortlist.listByLead(leadId);
      if (active.some((entry) => entry.projectId === projectId && entry.removedAt === null)) continue;
      await shortlistProject(tx, leadId, projectId, actor, now, { advanceStatus: false });
    }

    let planned: PlanKind | null = null;
    if (plan) {
      if (plan.kind === "SITE_VISIT") {
        await scheduleSiteVisit(tx, leadId, { scheduledAt: plan.scheduledAt, projectId: ids[0], notes: plan.note }, actor, now);
      } else {
        const map = FOLLOW_UP_TYPE[plan.kind];
        const text = [map.prefix, plan.note].filter(Boolean).join(": ") || undefined;
        await scheduleFollowUp(tx, leadId, { scheduledAt: plan.scheduledAt, type: map.type, note: text }, actor, now);
      }
      planned = plan.kind;
    }

    let noteAdded = false;
    if (note) {
      await addNote(tx, leadId, note, actor, now);
      noteAdded = true;
    }

    return { saved: true, leadId, createdLead, projects: ids.length, planned, requirementSaved, noteAdded };
  });
}
