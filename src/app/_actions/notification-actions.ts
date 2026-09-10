"use server";

import { requireUserIdForAction } from "@/lib/auth";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-service";
import type { Notification } from "@/lib/notifications/types";

/**
 * Every function here calls `requireUserIdForAction` FIRST and uses only
 * the id it returns — never a userId supplied by the browser — so a
 * notification can never be listed, counted, or marked read for anyone
 * but the actual authenticated caller. `markNotificationRead` additionally
 * relies on the repository's own ownership check (see notifications/repository.ts).
 */

export async function getNotificationsAction(): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const userId = await requireUserIdForAction();
  const repo = createPostgresNotificationRepository();
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(repo, userId),
    getUnreadCount(repo, userId),
  ]);
  return { notifications, unreadCount };
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  const userId = await requireUserIdForAction();
  const repo = createPostgresNotificationRepository();
  return getUnreadCount(repo, userId);
}

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const userId = await requireUserIdForAction();
  const repo = createPostgresNotificationRepository();
  await markNotificationRead(repo, notificationId, userId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const userId = await requireUserIdForAction();
  const repo = createPostgresNotificationRepository();
  await markAllNotificationsRead(repo, userId);
}
