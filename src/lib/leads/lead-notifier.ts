import type { NotificationRepository } from "../notifications/repository.ts";
import type { LeadNotification, LeadNotifier } from "./follow-up-service.ts";

/**
 * Connects the follow-up service's notification port to the EXISTING in-app notification system (the table, the
 * bell, the read/unread handling) — there is no second notification system. The notification's owner is always the
 * Clerk user id the service decided on (a team member's own id); text never contains a buyer's name or number.
 */
export function createLeadNotifier(repo: NotificationRepository): LeadNotifier {
  return {
    async notify(notification: LeadNotification) {
      await repo.create({
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        targetRoute: notification.targetRoute,
      });
    },
  };
}
