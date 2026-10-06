import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import { staffMembers } from "../../developer-connect/db/schema.ts";
import { StaffNotFoundError, StaffStateError } from "../errors.ts";
import type { NewStaffMember, StaffPatch, StaffRepository } from "../repository.ts";
import type { StaffMember } from "../types.ts";

/** PostgreSQL adapter for the team. Same database and schema.ts as the rest of the product (migration 0018). */

type Db = NodePgDatabase<typeof schema>;

const toMember = (row: typeof staffMembers.$inferSelect): StaffMember => ({ ...row });

/** Unique-violation detection that survives Drizzle wrapping the driver error. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

function build(db: Db): StaffRepository {
  return {
    async create(input: NewStaffMember) {
      try {
        const [row] = await db
          .insert(staffMembers)
          .values({
            id: randomUUID(),
            userId: input.userId,
            displayName: input.displayName,
            email: input.email,
            role: input.role,
            active: true,
            createdBy: input.createdBy,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        return toMember(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new StaffStateError("That person is already on the team.");
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
    async list() {
      const rows = await db.select().from(staffMembers).orderBy(desc(staffMembers.active), asc(staffMembers.displayName), asc(staffMembers.id));
      return rows.map(toMember);
    },
    async update(id, patch: StaffPatch, at) {
      const [row] = await db.update(staffMembers).set({ ...patch, updatedAt: at }).where(eq(staffMembers.id, id)).returning();
      if (!row) throw new StaffNotFoundError("Team member not found.");
      return toMember(row);
    },
  };
}

export function createPostgresStaffRepository(): StaffRepository {
  return build(getDb());
}

// Re-exported so tests can aim the adapter at a specific handle.
export { build as buildStaffRepository };
