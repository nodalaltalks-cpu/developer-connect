import type { NotificationRepository } from "./repository.ts";
import type { Notification } from "./types.ts";
import { NotFoundError } from "../developer-connect/errors.ts";

/** Newest first, capped at `limit`. */
export async function listNotifications(
  repo: NotificationRepository,
  userId: string,
  limit?: number,
): Promise<Notification[]> {
  return repo.listForUser(userId, limit);
}

export async function getUnreadCount(repo: NotificationRepository, userId: string): Promise<number> {
  return repo.countUnreadForUser(userId);
}

/** Marks one notification read. Ownership is enforced by the repository query itself, not just this check. */
export async function markNotificationRead(
  repo: NotificationRepository,
  id: string,
  userId: string,
): Promise<Notification> {
  const updated = await repo.markRead(id, userId);
  if (!updated) {
    throw new NotFoundError(`Notification ${id} not found for this user`);
  }
  return updated;
}

export async function markAllNotificationsRead(
  repo: NotificationRepository,
  userId: string,
): Promise<number> {
  return repo.markAllRead(userId);
}
