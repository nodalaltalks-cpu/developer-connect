import { LeadNotFoundError, LeadStateError, LeadValidationError } from "./errors.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor, canViewLead } from "./lead-access.ts";
import { advanceLeadStatus } from "./pipeline.ts";
import type { LeadRepositories } from "./repository.ts";
import { OPEN_SITE_VISIT_STATUSES, SITE_VISIT_OUTCOMES, type Lead, type LeadActor, type SiteVisit, type SiteVisitEvent, type SiteVisitOutcome, type SiteVisitStatus } from "./types.ts";

/**
 * Site visits. Framework-free; authorization is enforced HERE: the Founder for any lead, a team member only for a lead
 * they own (MANAGE_SITE_VISIT, subject to the missed-follow-up rule). A visit that belongs to a lead the actor may not
 * see looks exactly like a visit that does not exist.
 *
 * Lifecycle (every change is an immutable site_visit_event AND a lead timeline event, with who and when):
 *   SCHEDULED -> CONFIRMED -> COMPLETED | NO_SHOW | CANCELLED | RESCHEDULED
 *   SCHEDULED ->              COMPLETED | NO_SHOW | CANCELLED | RESCHEDULED
 * A visit can only be completed or marked no-show once its time has come. A reschedule never edits the old visit: it
 * closes it as RESCHEDULED and creates a new visit that points back. Finished visits are frozen (a database trigger
 * enforces it too). Times are the server's; the browser only proposes a future time.
 *
 * The lead's pipeline status moves FORWARD by itself when a visit is scheduled (SITE_VISIT_SCHEDULED) or completed
 * (SITE_VISIT_DONE), never backwards and never out of a secondary state (see pipeline.ts).
 */

export const CANCEL_REASONS = ["BUYER_REQUEST", "BUYER_NOT_AVAILABLE", "PROJECT_UNAVAILABLE", "OTHER"] as const;
export type CancelVisitReason = (typeof CANCEL_REASONS)[number];

const MAX_NOTES = 1000;
const MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;

function futureInstant(field: string, value: unknown, now: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new LeadValidationError(field, "Choose a date and time.");
  if (value.getTime() <= now.getTime()) throw new LeadValidationError(field, "Choose a time in the future.");
  if (value.getTime() - now.getTime() > MAX_AHEAD_MS) throw new LeadValidationError(field, "Choose a time within the next year.");
  return value;
}

function freeText(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new LeadValidationError(field, `The ${field} must be text.`);
  const t = value.trim();
  if (!t) return null;
  if (t.length > MAX_NOTES) throw new LeadValidationError(field, `The ${field} is too long (max ${MAX_NOTES} characters).`);
  return t;
}

async function recordChange(
  tx: LeadRepositories,
  visit: SiteVisit,
  actor: LeadActor,
  now: Date,
  event: { type: string; from: SiteVisitStatus | null; to: SiteVisitStatus; payload?: Record<string, unknown> },
): Promise<void> {
  // Ids, enums and times only - never notes - so erasure has nothing to scrub.
  const safe = event.payload ?? {};
  await tx.siteVisits.appendEvent({ visitId: visit.id, eventType: event.type, actorType: actor.actorType, actorId: actor.actorId ?? null, fromStatus: event.from, toStatus: event.to, payload: safe, createdAt: now });
  await tx.events.append({
    leadId: visit.leadId,
    eventType: event.type === "SCHEDULED" ? "SITE_VISIT_SCHEDULED" : "SITE_VISIT_UPDATED",
    actorType: actor.actorType,
    actorId: actor.actorId ?? null,
    developerId: null,
    fromStatus: null,
    toStatus: null,
    payload: { visitId: visit.id, projectId: visit.projectId, status: event.to, scheduledAt: visit.scheduledAt.toISOString(), ...safe },
    createdAt: now,
  });
}

// --- scheduling -----------------------------------------------------------------------------------

export async function scheduleSiteVisit(
  repos: LeadRepositories,
  leadId: string,
  input: { scheduledAt: Date; projectId?: string | null; notes?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<SiteVisit> {
  assertWorkingActor(actor);
  const scheduledAt = futureInstant("scheduledAt", input?.scheduledAt, now);
  const notes = freeText("notes", input.notes);
  return repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "MANAGE_SITE_VISIT", now);
    if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased.");
    let projectId: string | null = null;
    if (input.projectId) {
      const project = await tx.projects.getById(input.projectId);
      if (!project) throw new LeadValidationError("project", "Choose a project from the list.");
      if (project.status !== "ACTIVE") throw new LeadValidationError("project", "That project is not active.");
      projectId = project.id;
    }
    const requirement = await tx.requirements.getActiveByLead(leadId);
    const visit = await tx.siteVisits.create({ leadId, requirementId: requirement?.id ?? null, projectId, staffUserId: lead.ownerId ?? actor.actorId!, scheduledAt, notes, rescheduledFrom: null, createdBy: actor.actorId!, now });
    await recordChange(tx, visit, actor, now, { type: "SCHEDULED", from: null, to: "SCHEDULED" });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    await advanceLeadStatus(tx, (await tx.leads.getById(leadId))!, "SITE_VISIT_SCHEDULED", "SITE_VISIT_SCHEDULED", now);
    return visit;
  });
}

// --- changing a visit -----------------------------------------------------------------------------

type Change =
  | { kind: "CONFIRM" }
  | { kind: "COMPLETE"; outcome: SiteVisitOutcome; notes?: string | null; nextAction?: string | null }
  | { kind: "NO_SHOW"; notes?: string | null }
  | { kind: "CANCEL"; reason: CancelVisitReason; notes?: string | null }
  | { kind: "RESCHEDULE"; scheduledAt: Date };

async function load(tx: LeadRepositories, visitId: string, actor: LeadActor, now: Date, expectedLeadId?: string): Promise<{ visit: SiteVisit; lead: Lead }> {
  const visit = typeof visitId === "string" ? await tx.siteVisits.getById(visitId) : null;
  const lead = visit ? await tx.leads.getById(visit.leadId) : null;
  // A visit that belongs to a different lead than the page it was reached from is "not found": the lead id in the URL is not a way to reach it.
  if (!visit || !lead || !canViewLead(actor, lead) || (expectedLeadId !== undefined && visit.leadId !== expectedLeadId)) throw new LeadNotFoundError("Site visit not found.");
  await guardLeadAction(tx, actor, lead, "MANAGE_SITE_VISIT", now);
  return { visit, lead };
}

export async function changeSiteVisit(repos: LeadRepositories, visitId: string, change: Change, actor: LeadActor, now: Date = new Date(), expectedLeadId?: string): Promise<SiteVisit> {
  assertWorkingActor(actor);
  return repos.transaction(async (tx) => {
    const { visit, lead } = await load(tx, visitId, actor, now, expectedLeadId);
    if (!OPEN_SITE_VISIT_STATUSES.includes(visit.status)) throw new LeadStateError("This site visit is already finished and cannot be changed.");
    const due = visit.scheduledAt.getTime() <= now.getTime();

    switch (change.kind) {
      case "CONFIRM": {
        if (visit.status !== "SCHEDULED") throw new LeadStateError("This site visit is already confirmed.");
        const updated = await tx.siteVisits.update(visit.id, { status: "CONFIRMED", confirmedAt: now }, now);
        await recordChange(tx, updated, actor, now, { type: "CONFIRMED", from: visit.status, to: "CONFIRMED" });
        await tx.leads.update(lead.id, { lastActivityAt: now }, now);
        return updated;
      }
      case "COMPLETE": {
        if (!(SITE_VISIT_OUTCOMES as readonly string[]).includes(change.outcome)) throw new LeadValidationError("outcome", "Choose how the visit went.");
        if (!due) throw new LeadStateError("This visit has not happened yet. Complete it after the scheduled time.");
        const updated = await tx.siteVisits.update(visit.id, { status: "COMPLETED", completedAt: now, outcome: change.outcome, notes: freeText("notes", change.notes) ?? visit.notes, nextAction: freeText("nextAction", change.nextAction) }, now);
        await recordChange(tx, updated, actor, now, { type: "COMPLETED", from: visit.status, to: "COMPLETED", payload: { outcome: change.outcome } });
        await tx.leads.update(lead.id, { lastActivityAt: now }, now);
        await advanceLeadStatus(tx, (await tx.leads.getById(lead.id))!, "SITE_VISIT_DONE", "SITE_VISIT_COMPLETED", now);
        return updated;
      }
      case "NO_SHOW": {
        if (!due) throw new LeadStateError("This visit has not happened yet, so it cannot be a no-show.");
        const updated = await tx.siteVisits.update(visit.id, { status: "NO_SHOW", completedAt: now, notes: freeText("notes", change.notes) ?? visit.notes }, now);
        await recordChange(tx, updated, actor, now, { type: "NO_SHOW", from: visit.status, to: "NO_SHOW" });
        await tx.leads.update(lead.id, { lastActivityAt: now }, now);
        return updated;
      }
      case "CANCEL": {
        if (!(CANCEL_REASONS as readonly string[]).includes(change.reason)) throw new LeadValidationError("reason", "Choose why the visit was cancelled.");
        const updated = await tx.siteVisits.update(visit.id, { status: "CANCELLED", notes: freeText("notes", change.notes) ?? visit.notes }, now);
        await recordChange(tx, updated, actor, now, { type: "CANCELLED", from: visit.status, to: "CANCELLED", payload: { reason: change.reason } });
        await tx.leads.update(lead.id, { lastActivityAt: now }, now);
        return updated;
      }
      case "RESCHEDULE": {
        const scheduledAt = futureInstant("scheduledAt", change.scheduledAt, now);
        const closed = await tx.siteVisits.update(visit.id, { status: "RESCHEDULED" }, now);
        const next = await tx.siteVisits.create({ leadId: lead.id, requirementId: visit.requirementId, projectId: visit.projectId, staffUserId: visit.staffUserId, scheduledAt, notes: visit.notes, rescheduledFrom: visit.id, createdBy: actor.actorId!, now });
        await recordChange(tx, closed, actor, now, { type: "RESCHEDULED", from: visit.status, to: "RESCHEDULED", payload: { rescheduledTo: scheduledAt.toISOString() } });
        await recordChange(tx, next, actor, now, { type: "SCHEDULED", from: null, to: "SCHEDULED", payload: { rescheduledFrom: visit.id } });
        await tx.leads.update(lead.id, { lastActivityAt: now }, now);
        return next;
      }
    }
  });
}

// --- reads ----------------------------------------------------------------------------------------

export interface VisitView {
  visit: SiteVisit;
  projectName: string | null;
  /** SCHEDULED/CONFIRMED and the time has passed: waiting for someone to record what happened. */
  awaitingOutcome: boolean;
}

export async function getLeadVisits(repos: LeadRepositories, actor: LeadActor, leadId: string, now: Date = new Date()): Promise<VisitView[]> {
  assertWorkingActor(actor);
  const lead = typeof leadId === "string" ? await repos.leads.getById(leadId) : null;
  if (!lead || !canViewLead(actor, lead)) throw new LeadNotFoundError("Lead not found.");
  const visits = await repos.siteVisits.listByLead(leadId);
  const names = new Map<string, string>();
  for (const id of new Set(visits.map((v) => v.projectId).filter((v): v is string => !!v))) {
    const p = await repos.projects.getById(id);
    if (p) names.set(id, p.name);
  }
  return visits.map((visit) => ({ visit, projectName: visit.projectId ? (names.get(visit.projectId) ?? null) : null, awaitingOutcome: OPEN_SITE_VISIT_STATUSES.includes(visit.status) && visit.scheduledAt.getTime() <= now.getTime() }));
}

export interface UpcomingVisit extends VisitView {
  lead: Lead;
}

/**
 * Open visits (soonest first) the actor may see: the Founder all of them; a team member only their own, and only for
 * a lead they still own. Bounded.
 */
export async function listOpenVisits(repos: LeadRepositories, actor: LeadActor, now: Date = new Date(), limit = 50): Promise<UpcomingVisit[]> {
  assertWorkingActor(actor);
  const visits = await repos.siteVisits.list({ staffUserId: actor.actorType === "EMPLOYEE" ? actor.actorId : undefined, statuses: [...OPEN_SITE_VISIT_STATUSES], limit });
  const out: UpcomingVisit[] = [];
  for (const visit of visits) {
    const lead = await repos.leads.getById(visit.leadId);
    if (!lead || !canViewLead(actor, lead)) continue;
    const project = visit.projectId ? await repos.projects.getById(visit.projectId) : null;
    out.push({ visit, lead, projectName: project?.name ?? null, awaitingOutcome: visit.scheduledAt.getTime() <= now.getTime() });
  }
  return out;
}

export async function getVisitEvents(repos: LeadRepositories, actor: LeadActor, visitId: string): Promise<SiteVisitEvent[]> {
  assertWorkingActor(actor);
  const visit = typeof visitId === "string" ? await repos.siteVisits.getById(visitId) : null;
  const lead = visit ? await repos.leads.getById(visit.leadId) : null;
  if (!visit || !lead || !canViewLead(actor, lead)) throw new LeadNotFoundError("Site visit not found.");
  return repos.siteVisits.listEvents(visitId);
}
