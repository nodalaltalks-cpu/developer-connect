import { randomUUID } from "node:crypto";
import { and, desc, eq, count } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import { notifications } from "../../developer-connect/db/schema.ts";
import type { Notification } from "../types.ts";
import type { NotificationRepository } from "../repository.ts";

type DbOrTx = NodePgDatabase<typeof schema>;

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    targetRoute: row.targetRoute ?? null,
    read: row.read,
    createdAt: row.createdAt,
    readAt: row.readAt ?? null,
  };
}

/**
 * Shares the same Postgres pool and `notifications` table as the rest of
 * the app — one database, no second store. Accepts an optional Drizzle
 * handle so a caller composing a larger transaction (e.g. Contact's
 * status-change service, which must write the new status, its history
 * event, and this notification all-or-nothing) can pass its own `tx`
 * instead of always going through the module-level pool. Every existing
 * call site keeps working unchanged, since this defaults to `getDb()`.
 */
export function createPostgresNotificationRepository(db: DbOrTx = getDb()): NotificationRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(notifications)
        .values({
          id: randomUUID(),
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          targetRoute: input.targetRoute ?? null,
        })
        .returning();
      return toNotification(row);
    },
    async listForUser(userId, limit = 20) {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return rows.map(toNotification);
    },
    async countUnreadForUser(userId) {
      const [row] = await db
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
      return row?.n ?? 0;
    },
    async markRead(id, userId) {
      const [row] = await db
        .update(notifications)
        .set({ read: true, readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
        .returning();
      return row ? toNotification(row) : null;
    },
    async markAllRead(userId) {
      const rows = await db
        .update(notifications)
        .set({ read: true, readAt: new Date() })
        .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
        .returning({ id: notifications.id });
      return rows.length;
    },
    async hasUnreadOfType(userId, type) {
      const [row] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.type, type),
            eq(notifications.read, false),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
    async findUnreadByTarget(userId, targetRoute) {
      const [row] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.targetRoute, targetRoute),
            eq(notifications.read, false),
          ),
        )
        .limit(1);
      return row ? toNotification(row) : null;
    },
    async listByType(type, limit = 50) {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, type))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return rows.map(toNotification);
    },
  };
}
