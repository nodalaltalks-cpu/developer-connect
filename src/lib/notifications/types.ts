/**
 * In-house notification model (Phase 3B). Deliberately small: one type
 * today (PROFILE_COMPLETION), generated only by
 * profile-completion-notifier.ts — see there for the single place
 * notification copy is written.
 */
export type NotificationType = "PROFILE_COMPLETION";

export interface Notification {
  id: string;
  /** Clerk user id — always the authenticated owner, never trusted from the browser. */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Where clicking the notification should take the user, if anywhere. */
  targetRoute: string | null;
  read: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface NewNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetRoute?: string | null;
}
