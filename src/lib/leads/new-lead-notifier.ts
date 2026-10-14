import { listFounderUserIds } from "../admin-analytics/clerk-users.ts";
import type { NotificationRepository } from "../notifications/repository.ts";

/**
 * Puts a new enquiry in the in-app notification bell of everyone who must act on it: every Founder account, and the team member the
 * lead is assigned to (when it is not a Founder). The text never contains the buyer's name or number; the link opens the lead.
 * Best effort: the caller never lets a failure here affect the enquiry itself.
 */
export interface NewEnquiryInfo {
  leadId: string;
  ownerId: string | null;
  developerName: string | null;
  /** True for a brand-new lead; false when an existing lead enquired again. */
  created: boolean;
}

export interface NewEnquiryNotifier {
  received(info: NewEnquiryInfo): Promise<void>;
}

export function createNewEnquiryNotifier(notifications: NotificationRepository, founderIds: () => Promise<string[]> = listFounderUserIds): NewEnquiryNotifier {
  return {
    async received(info) {
      const founders = await founderIds();
      const title = info.created ? "New enquiry: contact as soon as possible" : "An existing lead enquired again: contact as soon as possible";
      const body = info.developerName ? `A buyer asked to connect with ${info.developerName}.` : "A buyer asked to be contacted.";
      const recipients = new Map<string, string>();
      for (const id of founders) recipients.set(id, `/admin/leads/${info.leadId}`);
      if (info.ownerId && !recipients.has(info.ownerId)) recipients.set(info.ownerId, `/team/leads/${info.leadId}`);
      await Promise.all([...recipients].map(([userId, targetRoute]) => notifications.create({ userId, type: "LEAD_NEW", title, body, targetRoute })));
    },
  };
}
