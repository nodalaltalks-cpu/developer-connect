import type { BuyerEnquiry, NewBuyerEnquiry, RatingSummary } from "./types.ts";

export interface BuyerEnquiryRepository {
  create(input: NewBuyerEnquiry): Promise<BuyerEnquiry>;
  /** An entry of the same user, kind, title and detail created at or after `since`, if any (used to suppress double taps). */
  findRecentDuplicate(input: { userId: string; kind: string; title: string; detail: string | null; since: Date }): Promise<BuyerEnquiry | null>;
  /** The owner's own history, newest first. */
  listForUser(userId: string, limit?: number): Promise<BuyerEnquiry[]>;
  /** Saves or changes the rating of ONE of the owner's entries. Null when the entry is not theirs. */
  saveRating(input: { userId: string; id: string; rating: number; comment: string | null; raterName: string | null; ratedAt: Date }): Promise<BuyerEnquiry | null>;

  // Founder reads. Never user-scoped: only called from founder-gated code.
  listRated(options?: { limit?: number; maxStars?: number; since?: Date }): Promise<BuyerEnquiry[]>;
  summary(): Promise<RatingSummary>;
  markAllSeen(now: Date): Promise<number>;
  latestRatedAt(): Promise<Date | null>;

  /** Erasure of the buyer's lead: removes the free text and name from their entries (the stars stay, anonymously). */
  scrubForLead(leadId: string): Promise<number>;
}
