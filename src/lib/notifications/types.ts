/**
 * In-house notification model (Phase 3B, extended in Phase 4B). Two types:
 *  - PROFILE_COMPLETION: system-generated, from profile-completion-notifier.ts.
 *  - FOUNDER_MESSAGE: explicitly composed and sent by the founder via
 *    /admin/notifications (see founder-notification-service.ts) — kept
 *    distinct from PROFILE_COMPLETION so a founder-sent nudge is never
 *    silently blocked by (or silently dismisses) an unrelated
 *    system-generated one in the same-type anti-spam check.
 */
export type NotificationType = "PROFILE_COMPLETION" | "FOUNDER_MESSAGE";

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
