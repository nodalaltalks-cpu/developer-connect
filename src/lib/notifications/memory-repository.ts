import { randomUUID } from "node:crypto";
import type { Notification } from "./types.ts";
import type { NotificationRepository } from "./repository.ts";

/** In-memory reference implementation for tests — not production persistence. */
export function createInMemoryNotificationRepository(): NotificationRepository {
  const notifications = new Map<string, Notification>();

  return {
    async create(input) {
      const notification: Notification = {
        id: randomUUID(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        targetRoute: input.targetRoute ?? null,
        read: false,
        createdAt: new Date(),
        readAt: null,
      };
      notifications.set(notification.id, notification);
      return notification;
    },
    async listForUser(userId, limit = 20) {
      return Array.from(notifications.values())
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async countUnreadForUser(userId) {
      return Array.from(notifications.values()).filter((n) => n.userId === userId && !n.read)
        .length;
    },
    async markRead(id, userId) {
      const existing = notifications.get(id);
      if (!existing || existing.userId !== userId) return null;
      const updated: Notification = { ...existing, read: true, readAt: new Date() };
      notifications.set(id, updated);
      return updated;
    },
    async markAllRead(userId) {
      let count = 0;
      for (const [id, n] of notifications) {
        if (n.userId === userId && !n.read) {
          notifications.set(id, { ...n, read: true, readAt: new Date() });
          count += 1;
        }
      }
      return count;
    },
    async hasUnreadOfType(userId, type) {
      return Array.from(notifications.values()).some(
        (n) => n.userId === userId && n.type === type && !n.read,
      );
    },
    async findUnreadByTarget(userId, targetRoute) {
      return (
        Array.from(notifications.values()).find(
          (n) => n.userId === userId && n.targetRoute === targetRoute && !n.read,
        ) ?? null
      );
    },
    async listByType(type, limit = 50) {
      return Array.from(notifications.values())
        .filter((n) => n.type === type)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
  };
}
