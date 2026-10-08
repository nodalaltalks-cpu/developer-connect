import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import { staffEvents, staffMembers } from "../../developer-connect/db/schema.ts";
import { StaffNotFoundError, StaffStateError } from "../errors.ts";
import type { NewStaffMember, StaffEventInput, StaffPatch, StaffRepository } from "../repository.ts";
import { PLACEHOLDER_PREFIX, type ExitReason, type StaffEvent, type StaffEventType, type StaffMember } from "../types.ts";

/** PostgreSQL adapter for the team. Same database and schema.ts as the rest of the product (migrations 0018 and 0027). */

type Db = NodePgDatabase<typeof schema>;

const toMember = (row: typeof staffMembers.$inferSelect): StaffMember => ({ ...row, exitReason: (row.exitReason as ExitReason | null) ?? null });
const toEvent = (row: typeof staffEvents.$inferSelect): StaffEvent => ({ ...row, eventType: row.eventType as StaffEventType, payload: (row.payload ?? {}) as Record<string, unknown> });

/** Unique-violation detection that survives Drizzle wrapping the driver error. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/** Inserts the lifecycle events for `member` using `h` (a transaction handle), so they commit with the change itself. */
async function writeEvents(h: Db, member: { id: string; employeeId: string }, at: Date, inputs?: readonly StaffEventInput[]) {
  for (const e of inputs ?? []) {
    await h.insert(staffEvents).values({ id: randomUUID(), staffId: member.id, employeeId: member.employeeId, eventType: e.eventType, actorId: e.actorId, occurredAt: at, payload: e.payload ?? {} });
  }
}

function build(db: Db): StaffRepository {
  const inTx = <T>(work: (h: Db) => Promise<T>): Promise<T> => db.transaction((tx) => work(tx as unknown as Db));
  return {
    async create(input: NewStaffMember, eventInputs?: readonly StaffEventInput[]) {
      const status = input.status ?? "ACTIVE";
      const approvedAt = status === "ACTIVE" ? (input.approvedAt ?? input.now) : (input.approvedAt ?? null);
      try {
        return await inTx(async (h) => {
        const [row] = await h
          .insert(staffMembers)
          .values({
            id: randomUUID(),
            // The permanent ID comes from a database sequence: atomic under concurrency, never repeats.
            employeeId: sql`'DC' || nextval('staff_employee_number_seq')`,
            userId: input.userId,
            displayName: input.displayName,
            email: input.email ? input.email.trim().toLowerCase() : null,
            role: input.role,
            status,
            active: status === "ACTIVE",
            joinedAt: status === "ACTIVE" ? (input.joinedAt ?? input.now) : (input.joinedAt ?? null),
            approvedAt,
            approvedBy: approvedAt ? (input.approvedBy ?? input.createdBy) : null,
            createdBy: input.createdBy,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        await writeEvents(h, row, input.now, eventInputs);
        return toMember(row);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new StaffStateError("That person or email is already on the team.");
        throw error;
      }
    },
    async getById(id) {
      const [row] = await db.select().from(staffMembers).where(eq(staffMembers.id, id));
      return row ? toMember(row) : null;
    },
    async getByUserId(userId) {
      const [row] = await db.select().from(staffMembers).where(eq(staffMembers.userId, userId));
      return row ? toMember(row) : null;
    },
    async getByEmployeeId(employeeId) {
      const [row] = await db.select().from(staffMembers).where(eq(staffMembers.employeeId, employeeId));
      return row ? toMember(row) : null;
    },
    async findUnlinkedByEmail(email) {
      const [row] = await db
        .select()
        .from(staffMembers)
        .where(and(like(staffMembers.userId, `${PLACEHOLDER_PREFIX}%`), eq(staffMembers.status, "INVITED"), sql`lower(${staffMembers.email}) = ${email.trim().toLowerCase()}`));
      return row ? toMember(row) : null;
    },
    async linkIdentity(id, userId, at, eventInputs) {
      try {
        return await inTx(async (h) => {
        const [row] = await h
          .update(staffMembers)
          .set({ userId, status: "ACTIVE", active: true, joinedAt: sql`coalesce(${staffMembers.joinedAt}, ${at})`, updatedAt: at })
          .where(and(eq(staffMembers.id, id), like(staffMembers.userId, `${PLACEHOLDER_PREFIX}%`), eq(staffMembers.status, "INVITED"), isNotNull(staffMembers.approvedAt)))
          .returning();
        if (row) await writeEvents(h, row, at, eventInputs);
        return row ? toMember(row) : null;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new StaffStateError("That sign-in is already linked to a team member.");
        throw error;
      }
    },
    async list() {
      const rows = await db.select().from(staffMembers).orderBy(desc(staffMembers.active), asc(sql`substr(${staffMembers.employeeId}, 3)::int`));
      return rows.map(toMember);
    },
    async update(id, patch: StaffPatch, at, eventInputs) {
      const next: Record<string, unknown> = { ...patch, updatedAt: at };
      // `active` always follows `status` (a check constraint enforces it too).
      if (patch.status !== undefined) next.active = patch.status === "ACTIVE";
      let row;
      try {
        row = await inTx(async (h) => {
          const [updated] = await h.update(staffMembers).set(next).where(eq(staffMembers.id, id)).returning();
          if (updated) await writeEvents(h, updated, at, eventInputs);
          return updated;
        });
      } catch (error) {
        // The unique index on live emails is the final guard against two people sharing a login email.
        if (isUniqueViolation(error)) throw new StaffStateError("That email address already belongs to another team member.");
        throw error;
      }
      if (!row) throw new StaffNotFoundError("Team member not found.");
      return toMember(row);
    },
    async appendEvent(event) {
      const [row] = await db.insert(staffEvents).values({ id: randomUUID(), staffId: event.staffId, employeeId: event.employeeId, eventType: event.eventType, actorId: event.actorId, occurredAt: event.occurredAt, payload: event.payload }).returning();
      return toEvent(row);
    },
    async listEvents(staffId, limit) {
      const rows = await db.select().from(staffEvents).where(eq(staffEvents.staffId, staffId)).orderBy(asc(staffEvents.occurredAt)).limit(limit);
      return rows.map(toEvent);
    },
  };
}

export function createPostgresStaffRepository(): StaffRepository {
  return build(getDb());
}

// Re-exported so tests can aim the adapter at a specific handle.
export { build as buildStaffRepository };
