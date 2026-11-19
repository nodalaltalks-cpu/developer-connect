import { randomUUID } from "node:crypto";
import { directCtx, type DocView, type FsCtx } from "../../firestore/tx.ts";
import { monotonic, reqDate, safeId, toDate, toTs } from "../../firestore/convert.ts";
import { StaffNotFoundError, StaffStateError } from "../errors.ts";
import type { NewStaffMember, StaffEventInput, StaffPatch, StaffRepository } from "../repository.ts";
import { PLACEHOLDER_PREFIX, type ExitReason, type StaffEvent, type StaffEventType, type StaffMember } from "../types.ts";

/**
 * Firestore adapter for the team. Collections: `staffMembers`, `staffEvents`.
 *
 * What PostgreSQL enforced with unique indexes and a sequence is enforced here with "lookup" documents written in the
 * same transaction as the member: `lookups/staffUser:<userId>`, `lookups/staffEmail:<lowercased live email>` and
 * `lookups/staffEmp:<employeeId>` each point at the owning member, so a second claim on the same key finds the
 * document already there and is refused. The permanent employee number comes from `counters/staffEmployeeNumber`,
 * incremented inside the creating transaction, so it is atomic under concurrency and never repeats.
 */

const MEMBERS = "staffMembers";
const EVENTS = "staffEvents";
const COUNTER = "counters/staffEmployeeNumber";
/** The Founder is DC1; the first employee is DC2. The migration script overwrites this with the Postgres sequence's position. */
const FIRST_EMPLOYEE_NUMBER = 2;

const userKey = (userId: string) => `staffUser:${safeId(userId)}`;
const emailKey = (email: string) => `staffEmail:${safeId(email)}`;
const empKey = (employeeId: string) => `staffEmp:${safeId(employeeId)}`;

function toMember(v: DocView): StaffMember {
  const d = v.data()!;
  return {
    id: v.id,
    employeeId: d.employeeId,
    userId: d.userId,
    displayName: d.displayName,
    email: d.email ?? null,
    phone: d.phone ?? null,
    roleTitle: d.roleTitle ?? null,
    tabAccess: d.tabAccess ?? null,
    role: d.role,
    status: d.status,
    active: d.active === true,
    createdBy: d.createdBy,
    joinedAt: toDate(d.joinedAt),
    approvedAt: toDate(d.approvedAt),
    approvedBy: d.approvedBy ?? null,
    deactivatedAt: toDate(d.deactivatedAt),
    deactivatedBy: d.deactivatedBy ?? null,
    exitedAt: toDate(d.exitedAt),
    exitedBy: d.exitedBy ?? null,
    exitReason: (d.exitReason as ExitReason | null) ?? null,
    createdAt: reqDate(d.createdAt),
    updatedAt: reqDate(d.updatedAt),
  };
}

function toDoc(m: StaffMember) {
  return {
    employeeId: m.employeeId,
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
    emailLower: m.email ? m.email.trim().toLowerCase() : null,
    phone: m.phone ?? null,
    roleTitle: m.roleTitle ?? null,
    tabAccess: m.tabAccess ?? null,
    role: m.role,
    status: m.status,
    active: m.active,
    createdBy: m.createdBy,
    joinedAt: toTs(m.joinedAt),
    approvedAt: toTs(m.approvedAt),
    approvedBy: m.approvedBy,
    deactivatedAt: toTs(m.deactivatedAt),
    deactivatedBy: m.deactivatedBy,
    exitedAt: toTs(m.exitedAt),
    exitedBy: m.exitedBy,
    exitReason: m.exitReason,
    createdAt: toTs(m.createdAt),
    updatedAt: toTs(m.updatedAt),
  };
}

/** The CHECK constraints the PostgreSQL table carried. */
function assertInvariants(m: StaffMember): void {
  const fail = (rule: string): never => {
    throw new Error(`staff invariant violated: ${rule}`);
  };
  if (m.displayName.trim().length === 0) fail("name present");
  if (!/^DC[1-9][0-9]*$/.test(m.employeeId)) fail("employee id format");
  if (m.active !== (m.status === "ACTIVE")) fail("active follows status");
  if ((m.status === "EXITED") !== (m.exitedAt !== null)) fail("exit pair");
}

/** The lookup key that must be unique for this member's email, or null when none applies (no email, or exited). */
function liveEmailKey(m: StaffMember): string | null {
  return m.email && m.status !== "EXITED" ? emailKey(m.email.trim().toLowerCase()) : null;
}

const membersOf = (c: FsCtx) => c.db.collection(MEMBERS);
const lookupOf = (c: FsCtx, key: string) => c.db.collection("lookups").doc(key);

async function writeEvents(c: FsCtx, member: { id: string; employeeId: string }, at: Date, inputs?: readonly StaffEventInput[]) {
  for (const e of inputs ?? []) {
    await c.create(c.db.collection(EVENTS).doc(randomUUID()), {
      staffId: member.id,
      employeeId: member.employeeId,
      eventType: e.eventType,
      actorId: e.actorId,
      occurredAt: toTs(at),
      payload: e.payload ?? {},
      _ord: monotonic(),
    });
  }
}

/** Takes the unique key for `memberId`, or throws StaffStateError when another member already holds it. */
async function claim(c: FsCtx, key: string, memberId: string, message: string) {
  const existing = await c.get(lookupOf(c, key));
  if (existing.exists && existing.data()!.staffId !== memberId) throw new StaffStateError(message);
  if (!existing.exists) await c.create(lookupOf(c, key), { staffId: memberId });
}

async function createIn(c: FsCtx, input: NewStaffMember, eventInputs?: readonly StaffEventInput[]): Promise<StaffMember> {
  const status = input.status ?? "ACTIVE";
  const approvedAt = status === "ACTIVE" ? (input.approvedAt ?? input.now) : (input.approvedAt ?? null);
  let employeeId = input.employeeId;
  if (!employeeId) {
    const counter = await c.get(c.db.doc(COUNTER));
    const next = (counter.data()?.next as number | undefined) ?? FIRST_EMPLOYEE_NUMBER;
    employeeId = `DC${next}`;
    if (counter.exists) await c.update(c.db.doc(COUNTER), { next: next + 1 });
    else await c.set(c.db.doc(COUNTER), { next: next + 1 });
  }
  const id = randomUUID();
  const member: StaffMember = {
    id,
    employeeId,
    userId: input.userId,
    displayName: input.displayName,
    email: input.email ? input.email.trim().toLowerCase() : null,
    phone: input.phone ?? null,
    roleTitle: input.roleTitle ?? null,
    tabAccess: null,
    role: input.role,
    status,
    active: status === "ACTIVE",
    createdBy: input.createdBy,
    joinedAt: status === "ACTIVE" ? (input.joinedAt ?? input.now) : (input.joinedAt ?? null),
    approvedAt,
    approvedBy: approvedAt ? (input.approvedBy ?? input.createdBy) : null,
    deactivatedAt: null,
    deactivatedBy: null,
    exitedAt: null,
    exitedBy: null,
    exitReason: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  assertInvariants(member);
  const taken = "That person or email is already on the team.";
  await claim(c, userKey(member.userId), id, taken);
  await claim(c, empKey(member.employeeId), id, taken);
  const ek = liveEmailKey(member);
  if (ek) await claim(c, ek, id, taken);
  await c.create(membersOf(c).doc(id), toDoc(member));
  await writeEvents(c, member, input.now, eventInputs);
  return member;
}

async function linkIn(c: FsCtx, id: string, userId: string, at: Date, eventInputs?: readonly StaffEventInput[]): Promise<StaffMember | null> {
  const v = await c.get(membersOf(c).doc(id));
  if (!v.exists) return null;
  const m = toMember(v);
  // Only an approved, not-yet-linked INVITED record may be linked.
  if (!m.userId.startsWith(PLACEHOLDER_PREFIX) || m.status !== "INVITED" || m.approvedAt === null) return null;
  await claim(c, userKey(userId), id, "That sign-in is already linked to a team member.");
  const next: StaffMember = { ...m, userId, status: "ACTIVE", active: true, joinedAt: m.joinedAt ?? at, updatedAt: at };
  assertInvariants(next);
  await c.delete(lookupOf(c, userKey(m.userId)));
  await c.set(membersOf(c).doc(id), toDoc(next));
  await writeEvents(c, next, at, eventInputs);
  return next;
}

async function updateIn(c: FsCtx, id: string, patch: StaffPatch, at: Date, eventInputs?: readonly StaffEventInput[]): Promise<StaffMember> {
  const v = await c.get(membersOf(c).doc(id));
  if (!v.exists) throw new StaffNotFoundError("Team member not found.");
  const m = toMember(v);
  const next: StaffMember = { ...m, ...patch, updatedAt: at };
  // `active` always follows `status`.
  if (patch.status !== undefined) next.active = patch.status === "ACTIVE";
  assertInvariants(next);
  const before = liveEmailKey(m);
  const after = liveEmailKey(next);
  if (after !== before) {
    // The live-email uniqueness is the final guard against two people sharing a login email.
    if (after) await claim(c, after, id, "That email address already belongs to another team member.");
    if (before) await c.delete(lookupOf(c, before));
  }
  await c.set(membersOf(c).doc(id), toDoc(next));
  await writeEvents(c, next, at, eventInputs);
  return next;
}

function build(ctx: FsCtx): StaffRepository {
  const one = async (q: FirebaseFirestore.Query) => {
    const rows = await ctx.query(q.limit(1));
    return rows[0] ? toMember(rows[0]) : null;
  };

  return {
    create: (input, eventInputs) => ctx.run((c) => createIn(c, input, eventInputs)),
    async getById(id) {
      const v = await ctx.get(membersOf(ctx).doc(id));
      return v.exists ? toMember(v) : null;
    },
    getByUserId: (userId) => one(membersOf(ctx).where("userId", "==", userId)),
    getByEmployeeId: (employeeId) => one(membersOf(ctx).where("employeeId", "==", employeeId)),
    async findUnlinkedByEmail(email) {
      const rows = await ctx.query(membersOf(ctx).where("status", "==", "INVITED").where("emailLower", "==", email.trim().toLowerCase()));
      return rows.map(toMember).find((m) => m.userId.startsWith(PLACEHOLDER_PREFIX)) ?? null;
    },
    linkIdentity: (id, userId, at, eventInputs) => ctx.run((c) => linkIn(c, id, userId, at, eventInputs)),
    async list() {
      const rows = (await ctx.query(membersOf(ctx))).map(toMember);
      const num = (m: StaffMember) => Number.parseInt(m.employeeId.slice(2), 10);
      return rows.sort((a, b) => Number(b.active) - Number(a.active) || num(a) - num(b));
    },
    update: (id, patch, at, eventInputs) => ctx.run((c) => updateIn(c, id, patch, at, eventInputs)),
    async appendEvent(event) {
      const id = randomUUID();
      await ctx.create(ctx.db.collection(EVENTS).doc(id), {
        staffId: event.staffId,
        employeeId: event.employeeId,
        eventType: event.eventType,
        actorId: event.actorId,
        occurredAt: toTs(event.occurredAt),
        payload: event.payload,
        _ord: monotonic(),
      });
      return { id, ...event };
    },
    async listEvents(staffId, limit) {
      const rows = await ctx.query(ctx.db.collection(EVENTS).where("staffId", "==", staffId).orderBy("occurredAt", "asc").orderBy("_ord", "asc").limit(limit));
      return rows.map<StaffEvent>((r) => {
        const d = r.data()!;
        return {
          id: r.id,
          staffId: d.staffId,
          employeeId: d.employeeId,
          eventType: d.eventType as StaffEventType,
          actorId: d.actorId ?? null,
          occurredAt: reqDate(d.occurredAt),
          payload: (d.payload ?? {}) as Record<string, unknown>,
        };
      });
    },
  };
}

export function createFirestoreStaffRepository(): StaffRepository {
  return build(directCtx());
}

export { build as buildFirestoreStaffRepository };
