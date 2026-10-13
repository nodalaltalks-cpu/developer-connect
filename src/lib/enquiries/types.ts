/**
 * A signed-in buyer's enquiry history and the rating they may leave on each entry. Plain data only: no phone number or email is ever
 * held here (the lead has those, behind the Founder's own access rules), so the buyer's own page and the Founder's rating list can
 * show an entry without exposing contact details.
 */

export const ENQUIRY_KINDS = ["DEVELOPER_CONNECT", "QUICK_ENQUIRY", "ADVISOR_CONTACT"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export const ADVISOR_CHANNELS = ["whatsapp", "call", "email"] as const;
export type AdvisorChannel = (typeof ADVISOR_CHANNELS)[number];

export const COMMENT_MAX = 600;
export const STAR_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

export interface BuyerEnquiry {
  id: string;
  /** The Clerk user id of the owner: always the authenticated caller, never a browser-supplied value. */
  userId: string;
  leadId: string | null;
  kind: EnquiryKind;
  developerId: string | null;
  /** What the buyer saw, for example "Connect with DAMAC Properties". */
  title: string;
  detail: string | null;
  raterName: string | null;
  createdAt: Date;
  rating: number | null;
  comment: string | null;
  ratedAt: Date | null;
  seenAt: Date | null;
}

export interface NewBuyerEnquiry {
  userId: string;
  leadId?: string | null;
  kind: EnquiryKind;
  developerId?: string | null;
  title: string;
  detail?: string | null;
  createdAt: Date;
}

export interface RatingSummary {
  /** Every enquiry entry that could be rated (all history rows). */
  totalEnquiries: number;
  rated: number;
  average: number | null;
  /** Index 0 is one star, index 4 is five stars. */
  distribution: [number, number, number, number, number];
  /** Rated entries the Founder has not yet marked as read. */
  unseen: number;
  /** Rated 1 to 3 stars: the ones worth a call. */
  needsAttention: number;
}
