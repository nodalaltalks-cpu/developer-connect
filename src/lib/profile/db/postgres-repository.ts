import { eq, sql } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { profiles } from "../../developer-connect/db/schema.ts";
import type { Profile } from "../types.ts";
import type { ProfileRepository } from "../repository.ts";

function toProfile(row: typeof profiles.$inferSelect): Profile {
  return {
    userId: row.userId,
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Shares the same Postgres pool and `profiles` table definition as the
 * developer-connect domain — one database, per the Phase 2D instruction
 * not to create a second one. Field updates use a JSONB merge (`||`), not
 * a full-row overwrite, so updating one field can never clobber another.
 */
export function createPostgresProfileRepository(): ProfileRepository {
  const db = getDb();

  return {
    async getByUserId(userId) {
      const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
      return row ? toProfile(row) : null;
    },
    async createIfMissing(userId) {
      const [inserted] = await db
        .insert(profiles)
        .values({ userId, data: {} })
        .onConflictDoNothing({ target: profiles.userId })
        .returning();
      if (inserted) return toProfile(inserted);

      const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
      return toProfile(existing);
    },
    async updateFields(userId, patch) {
      const [row] = await db
        .insert(profiles)
        .values({ userId, data: patch })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            data: sql`${profiles.data} || ${JSON.stringify(patch)}::jsonb`,
            updatedAt: new Date(),
          },
        })
        .returning();
      return toProfile(row);
    },
  };
}
