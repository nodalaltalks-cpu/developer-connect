import { LeadNotFoundError, LeadStateError, LeadValidationError, MissedFollowUpBlockError, UnauthorizedLeadActionError } from "./errors.ts";
import { assertMayAct, assertWorkingActor, type LeadCapability } from "./lead-access.ts";
import type { LeadRepositories } from "./repository.ts";
import type { NotificationType } from "../notifications/types.ts";
import {
  CANCEL_REASONS,
  FOLLOW_UP_TYPES,
  RETURN_REASONS,
  type CancelReason,
  type FollowUpType,
  type Lead,
  type LeadActor,
  type LeadEventType,
  type LeadFollowUp,
  type ReturnReason,
  type SystemCancelReason,
} from "./types.ts";

/**
 * Follow-up discipline (Phase 2): scheduling with an exact time, completion, rescheduling, cancellation, missed
 * detection, resolution, and returning a lead to the Founder. Framework-free; authorization is enforced HERE.
 *
 * How a follow-up is judged MISSED: the SERVER compares its exact scheduled instant with "now" — a follow-up that is
 * still SCHEDULED after its time is overdue/missed. No browser timer is involved. `sweepMissedFollowUps` records the
 * miss exactly once (an atomic status flip) as a FOLLOW_UP_MISSED event dated at the moment it was due, and every
 * resolution operation records a not-yet-recorded miss first, so a miss can never be skipped in the history.
 *
 * Discipline: while a team member has an unresolved missed follow-up, they may only work the leads that have one
 * (assertNotBlocked). They resolve each by completing it, rescheduling it, cancelling it with a reason, or returning
 * the lead — never by dismissing it. The Founder is never blocked and can resolve any follow-up.
 *
 * Every event is appended with a SERVER timestamp (`now`), by who, with ids/enums/times only — free text a person
 * typed (a note) is the one thing erasure removes.
 */

const MAX_NOTE = 500;
const MAX_HORIZON_DAYS = 366;
export const DUE_SOON_MINUTES = 15;

// --- notifications (port) -----------------------------------------------------------------------

export interface LeadNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetRoute: string;
}

/** Where in-app notifications go. The service only knows this interface; the server layer wires the real notification system. */
export interface LeadNotifier {
  notify(notification: LeadNotification): Promise<void>;
}

/** Best effort, AFTER the work committed: a notification failure never undoes or blocks a sales action. */
export async function deliver(notifier: LeadNotifier | undefined, notifications: readonly LeadNotification[]): Promise<void> {
  if (!notifier) return;
  for (const notification of notifications) {
    try {
      await notifier.notify(notification);
    } catch {
      // Intentionally swallowed: the history (events) is the record; a notification is a convenience.
    }
  }
}

export function missedNotification(followUp: LeadFollowUp): LeadNotification | null {
  if (!followUp.ownerId) return null;
  return {
    userId: followUp.ownerId,
    type: "FOLLOW_UP_MISSED",
    title: "Follow-up missed",
    body: "A follow-up on one of your leads is overdue. Open it to resolve it.",
    targetRoute: `/team/leads/${followUp.leadId}`,
  };
}

// --- shared helpers -----------------------------------------------------------------------------

function optionalNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new LeadValidationError("note", "A note must be text.");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_NOTE) throw new LeadValidationError("note", `The note is too long (max ${MAX_NOTE} characters).`);
  return trimmed;
}

/** An exact future instant. A date alone cannot reach here: callers parse a full date-time (see businessLocalToInstant). */
export function validateScheduledAt(value: unknown, now: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new LeadValidationError("scheduledAt", "Choose the exact date and time for the follow-up.");
  }
  if (value.getTime() <= now.getTime()) throw new LeadValidationError("scheduledAt", "Choose a time in the future.");
  if (value.getTime() > now.getTime() + MAX_HORIZON_DAYS * 86_400_000) {
    throw new LeadValidationError("scheduledAt", "That is too far ahead. Choose a date within a year.");
  }
  return value;
}

function validateType(value: unknown): FollowUpType {
  if (value === undefined || value === null) return "GENERAL_FOLLOW_UP";
  if (typeof value !== "string" || !(FOLLOW_UP_TYPES as readonly string[]).includes(value)) {
    throw new LeadValidationError("type", "That follow-up type does not exist.");
  }
  return value as FollowUpType;
}

async function requireLead(tx: LeadRepositories, leadId: string): Promise<Lead> {
  const lead = await tx.leads.getById(leadId);
  if (!lead) throw new LeadNotFoundError("Lead not found.");
  return lead;
}

function requireNotErased(lead: Lead): void {
  if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased and it can no longer be changed.");
}

async function append(
  tx: LeadRepositories,
  leadId: string,
  eventType: LeadEventType,
  actor: LeadActor,
  at: Date,
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
    createdAt: at,
  });
}

// --- the guard every team-member lead operation passes ------------------------------------------

/** Throws MissedFollowUpBlockError when this team member has unresolved misses and none of them is on `leadId`. */
export async function assertNotBlocked(tx: LeadRepositories, ownerId: string, leadId: string, now: Date): Promise<void> {
  const misses = await tx.followUps.listUnresolvedMissed({ ownerId, now, limit: 500 });
  if (misses.length > 0 && !misses.some((item) => item.followUp.leadId === leadId)) throw new MissedFollowUpBlockError(misses.length);
}

/** Throws MissedFollowUpBlockError when this team member has ANY unresolved miss. For starting something new (a new number, a new lead). */
export async function assertNoMissedFollowUps(tx: LeadRepositories, ownerId: string, now: Date): Promise<void> {
  const misses = await tx.followUps.listUnresolvedMissed({ ownerId, now, limit: 500 });
  if (misses.length > 0) throw new MissedFollowUpBlockError(misses.length);
}

/**
 * The one check a lead operation makes inside its transaction: may this actor do `capability` on this lead (and
 * does it exist for them at all), and — for a team member — are they free of unresolved misses elsewhere?
 */
export async function guardLeadAction(tx: LeadRepositories, actor: LeadActor, lead: Lead, capability: LeadCapability, now: Date): Promise<void> {
  assertMayAct(actor, lead, capability);
  if (actor.actorType === "EMPLOYEE") await assertNotBlocked(tx, actor.actorId!, lead.id, now);
}

// --- missed detection ---------------------------------------------------------------------------

async function recordMisses(tx: LeadRepositories, missed: readonly LeadFollowUp[], now: Date): Promise<void> {
  for (const followUp of missed) {
    // Dated at the moment it was due, so the timeline reads "2:00 PM — follow-up missed" however late it was noticed.
    await append(tx, followUp.leadId, "FOLLOW_UP_MISSED", { actorType: "SYSTEM" }, followUp.scheduledAt, {
      followUpId: followUp.id,
      followUpType: followUp.type,
      dueAt: followUp.scheduledAt.toISOString(),
      detectedAt: now.toISOString(),
    });
  }
}

/**
 * Finds every SCHEDULED follow-up (in `scope`) whose time has passed, marks it MISSED and records one
 * FOLLOW_UP_MISSED event for each. Idempotent and safe under concurrency: only the request that actually flips a row
 * records and notifies. Called whenever a team workspace or Founder missed-leads screen loads.
 */
export async function sweepMissedFollowUps(
  repos: LeadRepositories,
  scope: { ownerId?: string; leadId?: string },
  now: Date = new Date(),
  notifier?: LeadNotifier,
): Promise<LeadFollowUp[]> {
  const missed = await repos.transaction(async (tx) => {
    const flipped = await tx.followUps.markMissed(scope, now);
    await recordMisses(tx, flipped, now);
    return flipped;
  });
  await deliver(notifier, missed.map(missedNotification).filter((n): n is LeadNotification => n !== null));
  return missed;
}

/** "Due soon" notifications (once per scheduled time) for a team member's follow-ups due within DUE_SOON_MINUTES. */
export async function notifyDueFollowUps(
  repos: LeadRepositories,
  scope: { ownerId?: string },
  now: Date = new Date(),
  notifier?: LeadNotifier,
): Promise<LeadFollowUp[]> {
  const upTo = new Date(now.getTime() + DUE_SOON_MINUTES * 60_000);
  const claimed = await repos.transaction((tx) => tx.followUps.claimDueNotifications(scope, upTo, now));
  await deliver(
    notifier,
    claimed.map((followUp) => ({
      userId: followUp.ownerId!,
      type: "FOLLOW_UP_DUE" as const,
      title: "Follow-up due soon",
      body: `A follow-up on one of your leads is due within ${DUE_SOON_MINUTES} minutes.`,
      targetRoute: `/team/leads/${followUp.leadId}`,
    })),
  );
  return claimed;
}

// --- scheduling ---------------------------------------------------------------------------------

export interface ScheduleFollowUpInput {
  scheduledAt: Date;
  type?: FollowUpType;
  note?: string | null;
}

async function applyReschedule(
  tx: LeadRepositories,
  lead: Lead,
  open: LeadFollowUp,
  scheduledAt: Date,
  type: FollowUpType,
  note: string | null,
  actor: LeadActor,
  now: Date,
): Promise<LeadFollowUp> {
  const wasMissed = open.status === "MISSED";
  if (!wasMissed && open.scheduledAt.getTime() === scheduledAt.getTime() && open.type === type) {
    throw new LeadStateError("That is already the scheduled time.");
  }
  const updated = await tx.followUps.update(
    open.id,
    { scheduledAt, status: "SCHEDULED", type, note: note ?? open.note, rescheduleCount: open.rescheduleCount + 1, dueNotifiedAt: null, ownerId: lead.ownerId },
    now,
  );
  await append(tx, lead.id, "FOLLOW_UP_RESCHEDULED", actor, now, {
    followUpId: open.id,
    followUpType: type,
    from: open.scheduledAt.toISOString(),
    to: scheduledAt.toISOString(),
    wasMissed,
    ...(note ? { note } : {}),
  });
  await tx.leads.update(lead.id, { nextFollowUpAt: scheduledAt, lastActivityAt: now }, now);
  return updated;
}

/**
 * Schedules a follow-up at an exact time. If the lead already has an open one (scheduled or missed), that follow-up
 * is rescheduled instead — same id, counted, previous time kept in the event.
 */
export async function scheduleFollowUp(
  repos: LeadRepositories,
  leadId: string,
  input: ScheduleFollowUpInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadFollowUp> {
  assertWorkingActor(actor);
  const scheduledAt = validateScheduledAt(input?.scheduledAt, now);
  const type = validateType(input?.type);
  const note = optionalNote(input?.note);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    await guardLeadAction(tx, actor, lead, "SET_FOLLOW_UP", now);
    requireNotErased(lead);
    await recordMisses(tx, await tx.followUps.markMissed({ leadId }, now), now);

    const open = await tx.followUps.getOpenByLead(leadId);
    if (open) return applyReschedule(tx, lead, open, scheduledAt, type, note, actor, now);

    const created = await tx.followUps.create({ leadId, type, scheduledAt, ownerId: lead.ownerId, note, createdBy: actor.actorId!, now });
    await append(tx, leadId, "FOLLOW_UP_SET", actor, now, { followUpId: created.id, followUpType: type, dueAt: scheduledAt.toISOString(), ...(note ? { note } : {}) });
    await tx.leads.update(leadId, { nextFollowUpAt: scheduledAt, lastActivityAt: now }, now);
    return created;
  });
}

/** Reschedules a specific open follow-up (the id must belong to THIS lead). */
export async function rescheduleFollowUp(
  repos: LeadRepositories,
  leadId: string,
  followUpId: string,
  input: ScheduleFollowUpInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadFollowUp> {
  assertWorkingActor(actor);
  const scheduledAt = validateScheduledAt(input?.scheduledAt, now);
  const note = optionalNote(input?.note);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    await guardLeadAction(tx, actor, lead, "SET_FOLLOW_UP", now);
    requireNotErased(lead);
    await recordMisses(tx, await tx.followUps.markMissed({ leadId }, now), now);
    const open = await openFollowUpOf(tx, leadId, followUpId);
    const type = input?.type === undefined ? open.type : validateType(input.type);
    return applyReschedule(tx, lead, open, scheduledAt, type, note, actor, now);
  });
}

/** The open follow-up, which must be the one named — a follow-up id from another lead (or a closed one) is "not found". */
async function openFollowUpOf(tx: LeadRepositories, leadId: string, followUpId: string | undefined): Promise<LeadFollowUp> {
  const open = await tx.followUps.getOpenByLead(leadId);
  if (!open) throw new LeadStateError("This lead has no follow-up to change.");
  if (followUpId !== undefined && (typeof followUpId !== "string" || open.id !== followUpId)) throw new LeadNotFoundError("Follow-up not found.");
  return open;
}

/** Marks the open follow-up done (late if its time had passed). Resolves a miss. */
export async function completeLeadFollowUp(
  repos: LeadRepositories,
  leadId: string,
  options: { followUpId?: string; note?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadFollowUp> {
  assertWorkingActor(actor);
  const note = optionalNote(options?.note);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    await guardLeadAction(tx, actor, lead, "COMPLETE_FOLLOW_UP", now);
    requireNotErased(lead);
    await recordMisses(tx, await tx.followUps.markMissed({ leadId }, now), now);

    const open = await tx.followUps.getOpenByLead(leadId);
    if (!open) throw new LeadStateError("This lead has no follow-up to complete.");
    if (options?.followUpId !== undefined && open.id !== options.followUpId) throw new LeadNotFoundError("Follow-up not found.");

    const late = now.getTime() > open.scheduledAt.getTime();
    const done = await tx.followUps.update(open.id, { status: "COMPLETED", completedAt: now, completedBy: actor.actorId! }, now);
    await append(tx, leadId, "FOLLOW_UP_COMPLETED", actor, now, {
      followUpId: open.id,
      followUpType: open.type,
      dueAt: open.scheduledAt.toISOString(),
      late,
      ...(note ? { note } : {}),
    });
    await tx.leads.update(leadId, { nextFollowUpAt: null, lastActivityAt: now }, now);
    return done;
  });
}

async function closeFollowUp(
  tx: LeadRepositories,
  lead: Lead,
  open: LeadFollowUp,
  reason: CancelReason | SystemCancelReason,
  note: string | null,
  actor: LeadActor,
  now: Date,
): Promise<LeadFollowUp> {
  const cancelled = await tx.followUps.update(
    open.id,
    { status: "CANCELLED", cancelledAt: now, cancelledBy: actor.actorId ?? "system", cancelReason: reason, cancelNote: note },
    now,
  );
  await append(tx, lead.id, "FOLLOW_UP_CANCELLED", actor, now, { followUpId: open.id, reason, ...(note ? { note } : {}) });
  await tx.leads.update(lead.id, { nextFollowUpAt: null, lastActivityAt: now }, now);
  return cancelled;
}

/** Cancels the open follow-up with a structured reason (mandatory); the note is optional. Resolves a miss. */
export async function cancelLeadFollowUp(
  repos: LeadRepositories,
  leadId: string,
  followUpId: string | undefined,
  reason: CancelReason,
  note: string | null | undefined,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadFollowUp> {
  assertWorkingActor(actor);
  if (typeof reason !== "string" || !(CANCEL_REASONS as readonly string[]).includes(reason)) {
    throw new LeadValidationError("reason", "Choose why the follow-up is being cancelled.");
  }
  const cleanNote = optionalNote(note);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    await guardLeadAction(tx, actor, lead, "SET_FOLLOW_UP", now);
    requireNotErased(lead);
    await recordMisses(tx, await tx.followUps.markMissed({ leadId }, now), now);
    const open = await openFollowUpOf(tx, leadId, followUpId);
    return closeFollowUp(tx, lead, open, reason, cleanNote, actor, now);
  });
}

/**
 * Closes any open follow-up because the lead is leaving its owner (returned, reassigned) or being erased. Used inside
 * the caller's transaction; the follow-up row, its misses and its events all stay as history.
 */
export async function closeOpenFollowUpForLead(tx: LeadRepositories, lead: Lead, reason: SystemCancelReason, actor: LeadActor, now: Date): Promise<void> {
  await recordMisses(tx, await tx.followUps.markMissed({ leadId: lead.id }, now), now);
  const open = await tx.followUps.getOpenByLead(lead.id);
  if (open) await closeFollowUp(tx, lead, open, reason, null, actor, now);
}

// --- returning a lead ---------------------------------------------------------------------------

/** The Founder who last assigned this lead to `ownerId`, if the history shows one — the person to tell when it comes back. */
function founderWhoAssigned(events: readonly { eventType: string; actorType: string; actorId: string | null; payload: Record<string, unknown> }[], ownerId: string): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.eventType === "OWNER_CHANGED" && event.actorType === "FOUNDER" && event.payload.to === ownerId && event.actorId) return event.actorId;
  }
  return null;
}

/**
 * A team member sends a lead they own back to the Founder queue. The reason is mandatory (a structured category); the
 * note is optional. Ownership clears, the open follow-up is closed, and the history — theirs included — is untouched:
 * OWNER_CHANGED and RETURNED_TO_FOUNDER are appended, the buyer requirement and every timestamp stay as they were.
 */
export async function returnLeadToFounder(
  repos: LeadRepositories,
  leadId: string,
  reason: ReturnReason,
  note: string | null | undefined,
  actor: LeadActor,
  now: Date = new Date(),
  notifier?: LeadNotifier,
): Promise<Lead> {
  assertWorkingActor(actor);
  if (actor.actorType !== "EMPLOYEE") {
    throw new UnauthorizedLeadActionError("Only a team member returns a lead. The Founder reassigns it instead.");
  }
  if (typeof reason !== "string" || !(RETURN_REASONS as readonly string[]).includes(reason)) {
    throw new LeadValidationError("reason", "Choose why you are returning this lead.");
  }
  const cleanNote = optionalNote(note);

  const { lead: returned, notifications } = await repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    await guardLeadAction(tx, actor, lead, "RETURN_LEAD", now);
    requireNotErased(lead);
    const events = await tx.events.listByLead(leadId);

    await closeOpenFollowUpForLead(tx, lead, "RETURNED_TO_FOUNDER", actor, now);
    const previousOwnerId = lead.ownerId!;
    const updated = await tx.leads.update(
      leadId,
      { ownerId: null, returnedAt: now, returnedFrom: previousOwnerId, returnReason: reason, nextFollowUpAt: null, lastActivityAt: now },
      now,
    );
    await append(tx, leadId, "OWNER_CHANGED", actor, now, { from: previousOwnerId, to: null, via: "RETURN" });
    await append(tx, leadId, "RETURNED_TO_FOUNDER", actor, now, { reason, previousOwnerId, ...(cleanNote ? { note: cleanNote } : {}) });

    const founderId = founderWhoAssigned(events, previousOwnerId);
    const notifications: LeadNotification[] = founderId
      ? [{ userId: founderId, type: "LEAD_RETURNED", title: "Lead returned", body: "A team member returned a lead to you. Open Returned leads to see why.", targetRoute: "/admin/returned-leads" }]
      : [];
    return { lead: updated, notifications };
  });
  await deliver(notifier, notifications);
  return returned;
}
