import type { Notification, NewNotificationInput, NotificationType } from "./types.ts";

export interface NotificationRepository {
  create(input: NewNotificationInput): Promise<Notification>;
  /** Newest first. */
  listForUser(userId: string, limit?: number): Promise<Notification[]>;
  countUnreadForUser(userId: string): Promise<number>;
  /** No-ops (returns null) if the notification doesn't belong to userId — ownership is never assumed from the id alone. */
  markRead(id: string, userId: string): Promise<Notification | null>;
  markAllRead(userId: string): Promise<number>;
  /** Anti-spam check: is there already an unread notification of this type for this user? */
  hasUnreadOfType(userId: string, type: NotificationType): Promise<boolean>;
}
