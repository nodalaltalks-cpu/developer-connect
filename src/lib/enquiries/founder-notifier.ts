import { listFounderUserIds } from "../admin-analytics/clerk-users.ts";
import type { NotificationRepository } from "../notifications/repository.ts";
import { raterLabel, toStarText, type RatingNotifier } from "./service.ts";

/** Where a rating notification takes the Founder. */
export const RATINGS_ROUTE = "/admin/ratings";

/**
 * Tells every Founder account in the existing in-app notification system (the bell) that a buyer rated the service. The text has
 * the buyer's first name, the stars, what they rated and a short preview of the comment; never a phone number or an email.
 */
export function createFounderRatingNotifier(notifications: NotificationRepository, founderIds: () => Promise<string[]> = listFounderUserIds): RatingNotifier {
  return {
    async ratingReceived(entry, change) {
      if (entry.rating === null) return;
      const ids = await founderIds();
      const who = raterLabel(entry.raterName);
      const preview = entry.comment ? ` "${entry.comment.length > 90 ? `${entry.comment.slice(0, 87)}...` : entry.comment}"` : "";
      const title = `${toStarText(entry.rating)} ${who} ${change === "updated" ? "changed their rating" : "rated the service"}`;
      const body = `${entry.title}.${preview}`;
      await Promise.all(ids.map((userId) => notifications.create({ userId, type: "SERVICE_RATING", title, body, targetRoute: RATINGS_ROUTE })));
    },
  };
}
