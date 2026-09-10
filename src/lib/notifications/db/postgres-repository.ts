import { randomUUID } from "node:crypto";
import { and, desc, eq, count } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { notifications } from "../../developer-connect/db/schema.ts";
import type { Notification } from "../types.ts";
import type { NotificationRepository } from "../repository.ts";

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

/** Shares the same Postgres pool and `notifications` table as the rest of the app — one database, no second store. */
export function createPostgresNotificationRepository(): NotificationRepository {
  const db = getDb();

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
  };
}
