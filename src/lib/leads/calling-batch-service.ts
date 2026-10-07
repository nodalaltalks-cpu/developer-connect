import { LeadNotFoundError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import type { BatchLeadProgress, CallingBatch, LeadRepositories } from "./repository.ts";
import type { LeadActor, LeadCall } from "./types.ts";
import type { StaffRepository } from "../staff/repository.ts";

/**
 * CALLING BATCHES and the employee's CALLING QUEUE. Framework-free; authorization is enforced HERE.
 *
 * A batch is a list of EXISTING leads given to one employee to call (for example 100-500 numbers from a CSV import). It
 * references leads - nothing is copied. Everything about progress is derived from the call records and the leads, never
 * typed in:
 *   completed = leads with at least one call that reached the other end (classified DIALED or CONNECTED)
 *   connected = leads with at least one CONNECTED call (> 10 seconds)
 *   dialed    = completed leads that never connected (every call 10 seconds or less)
 *   returned  = leads the employee returned to the Founder
 *   pending   = still the employee's, not yet completed
 * A lead that was returned (or reassigned) leaves the employee's queue, but the history stays.
 */

export const MAX_BATCH_LEADS = 500;
const MAX_NAME = 120;

export interface CreateBatchResult {
  batch: CallingBatch;
  /** Leads placed in the batch (the employee now owns them). */
  included: number;
  /** Leads left out because another team member already owns them (never reassigned silently). */
  ownedByOthers: number;
  /** Leads left out because they have no phone number or their data was erased. */
  notCallable: number;
}

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required to create a calling batch.");
}

/**
 * Creates a calling batch for one active team member from existing leads. Founder only. Unowned leads become the
 * employee's (an OWNER_CHANGED event records it, like any assignment); leads another employee owns are left out and
 * counted - this never takes a lead away from someone.
 */
export async function createCallingBatch(
  repos: LeadRepositories,
  staff: StaffRepository,
  input: { name: string; assigneeStaffId: string; leadIds: string[]; importBatchId?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<CreateBatchResult> {
  assertFounder(actor);
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME) : "";
  if (!name) throw new LeadValidationError("name", "Give the batch a name.");
  if (!Array.isArray(input.leadIds) || input.leadIds.length === 0) throw new LeadValidationError("leads", "There are no leads to put in the batch.");
  if (input.leadIds.length > MAX_BATCH_LEADS) throw new LeadValidationError("leads", `A batch holds at most ${MAX_BATCH_LEADS} leads.`);
  const member = typeof input.assigneeStaffId === "string" ? await staff.getById(input.assigneeStaffId) : null;
  if (!member) throw new LeadValidationError("assignee", "Choose a team member from the list.");
  if (!member.active) throw new LeadValidationError("assignee", `${member.displayName} is inactive and cannot receive leads.`);

  return repos.transaction(async (tx) => {
    const included: string[] = [];
    let ownedByOthers = 0;
    let notCallable = 0;
    for (const leadId of [...new Set(input.leadIds)]) {
      const lead = await tx.leads.getById(leadId);
      if (!lead) {
        notCallable += 1;
        continue;
      }
      if (lead.erasedAt || !lead.phoneE164) {
        notCallable += 1;
        continue;
      }
      if (lead.ownerId !== null && lead.ownerId !== member.userId) {
        ownedByOthers += 1;
        continue;
      }
      if (lead.ownerId === null) {
        await tx.events.append({ leadId, eventType: "OWNER_CHANGED", actorType: "FOUNDER", actorId: actor.actorId, developerId: null, fromStatus: null, toStatus: null, payload: { from: null, to: member.userId, via: "CALLING_BATCH" }, createdAt: now });
        await tx.leads.update(leadId, { ownerId: member.userId, lastActivityAt: now, returnedAt: null, returnedFrom: null, returnReason: null }, now);
      }
      included.push(leadId);
    }
    if (included.length === 0) throw new LeadValidationError("leads", "None of those leads can be called by this team member.");
    const batch = await tx.callingBatches.create({ name, createdBy: actor.actorId, assignedTo: member.userId, importBatchId: input.importBatchId ?? null, leadIds: included, now });
    return { batch, included: included.length, ownedByOthers, notCallable };
  });
}

// --- the queue ------------------------------------------------------------------------------------

export type QueueState = "PENDING" | "CONNECTED" | "DIALED" | "RETURNED" | "REASSIGNED";

export interface QueueRow {
  progress: BatchLeadProgress;
  state: QueueState;
}

export interface QueueCounts {
  assigned: number;
  completed: number;
  connected: number;
  dialed: number;
  pending: number;
  returned: number;
}

export interface CallingQueue {
  batch: CallingBatch;
  rows: QueueRow[];
  counts: QueueCounts;
  /** The next lead to call: the first PENDING one in the batch order. null when nothing is left. */
  next: QueueRow | null;
}

function stateOf(p: BatchLeadProgress, assignedTo: string): QueueState {
  if (p.lead.ownerId === null && p.lead.returnedAt !== null) return "RETURNED";
  if (p.lead.ownerId !== assignedTo) return "REASSIGNED";
  if (p.connectedCalls > 0) return "CONNECTED";
  if (p.calls > 0) return "DIALED";
  return "PENDING";
}

export function buildQueue(batch: CallingBatch, progress: BatchLeadProgress[]): CallingQueue {
  const rows = progress.map((p): QueueRow => ({ progress: p, state: stateOf(p, batch.assignedTo) }));
  const count = (s: QueueState) => rows.filter((r) => r.state === s).length;
  const counts: QueueCounts = {
    assigned: rows.length,
    connected: count("CONNECTED"),
    dialed: count("DIALED"),
    pending: count("PENDING"),
    returned: count("RETURNED") + count("REASSIGNED"),
    completed: count("CONNECTED") + count("DIALED"),
  };
  return { batch, rows, counts, next: rows.find((r) => r.state === "PENDING") ?? null };
}

/** A batch's queue for an actor allowed to see it: the Founder any; an employee only their own. Otherwise null. */
export async function getCallingQueue(repos: LeadRepositories, actor: LeadActor, batchId: string): Promise<CallingQueue | null> {
  if (!actor.actorId || (actor.actorType !== "FOUNDER" && actor.actorType !== "EMPLOYEE")) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const batch = typeof batchId === "string" ? await repos.callingBatches.getById(batchId) : null;
  if (!batch) return null;
  if (actor.actorType === "EMPLOYEE" && batch.assignedTo !== actor.actorId) return null;
  return buildQueue(batch, await repos.callingBatches.progress(batch.id));
}

export interface BatchSummary {
  batch: CallingBatch;
  counts: QueueCounts;
}

/** The employee's batches with live counts (their own only). */
export async function listMyBatches(repos: LeadRepositories, actor: LeadActor): Promise<BatchSummary[]> {
  if (actor.actorType !== "EMPLOYEE" || !actor.actorId) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  const batches = await repos.callingBatches.listForAssignee(actor.actorId);
  return Promise.all(batches.map(async (batch) => ({ batch, counts: buildQueue(batch, await repos.callingBatches.progress(batch.id)).counts })));
}

/** Every batch with live counts (Founder). */
export async function listAllBatches(repos: LeadRepositories, actor: LeadActor, limit = 50): Promise<BatchSummary[]> {
  assertFounder(actor);
  const batches = await repos.callingBatches.listAll(limit);
  return Promise.all(batches.map(async (batch) => ({ batch, counts: buildQueue(batch, await repos.callingBatches.progress(batch.id)).counts })));
}

export async function closeCallingBatch(repos: LeadRepositories, batchId: string, actor: LeadActor): Promise<CallingBatch> {
  assertFounder(actor);
  const batch = await repos.callingBatches.getById(batchId);
  if (!batch) throw new LeadNotFoundError("Calling batch not found.");
  return repos.callingBatches.close(batchId);
}

export type { LeadCall };
