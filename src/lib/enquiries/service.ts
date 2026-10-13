import type { BuyerEnquiryRepository } from "./repository.ts";
import { ADVISOR_CHANNELS, COMMENT_MAX, STAR_LABELS, type AdvisorChannel, type BuyerEnquiry, type NewBuyerEnquiry } from "./types.ts";

/**
 * The rules for the buyer's enquiry history and ratings, framework-free so they are tested without a browser or a database.
 * The server actions add the signed-in user and the production repository; nothing here trusts a browser-supplied user id.
 */

/** A second tap on the same advisor channel within this window is the same contact, not a new entry. */
export const DUPLICATE_WINDOW_MINUTES = 10;

export class EnquiryRatingError extends Error {
  readonly field: "rating" | "comment" | "enquiry";
  constructor(field: "rating" | "comment" | "enquiry", message: string) {
    super(message);
    this.name = "EnquiryRatingError";
    this.field = field;
  }
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Free text from the browser: trimmed, control characters removed, length capped. Empty becomes null. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(CONTROL_CHARS, "").replace(/\r\n/g, "\n").trim();
  return text === "" ? null : text.slice(0, max);
}

export function validateRating(input: { rating: unknown; comment: unknown }): { rating: number; comment: string | null } {
  const rating = input.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new EnquiryRatingError("rating", "Choose between 1 and 5 stars.");
  }
  if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") {
    throw new EnquiryRatingError("comment", "The comment must be text.");
  }
  return { rating, comment: cleanText(input.comment, COMMENT_MAX) };
}

export function isAdvisorChannel(value: unknown): value is AdvisorChannel {
  return typeof value === "string" && (ADVISOR_CHANNELS as readonly string[]).includes(value);
}

const CHANNEL_WORDS: Record<AdvisorChannel, string> = { whatsapp: "on WhatsApp", call: "by phone call", email: "by email" };

/** The history entry for a buyer reaching an advisor. `subject` is visible page text (a developer or place), already cut short. */
export function advisorContactEntry(channel: AdvisorChannel, subject: string | null, now: Date, userId: string): NewBuyerEnquiry {
  return {
    userId,
    kind: "ADVISOR_CONTACT",
    title: `Talked to an advisor ${CHANNEL_WORDS[channel]}`,
    detail: subject ? `About ${subject}` : null,
    createdAt: now,
  };
}

/**
 * Records one history entry. An advisor contact repeated inside the window is not recorded again (a double tap or a back-and-forth
 * to WhatsApp is one conversation); the other kinds always are, because each is a separate submission.
 */
export async function recordEnquiry(repo: BuyerEnquiryRepository, input: NewBuyerEnquiry): Promise<BuyerEnquiry> {
  const title = input.title.slice(0, 160);
  const detail = input.detail ? input.detail.slice(0, 200) : null;
  if (input.kind === "ADVISOR_CONTACT") {
    const since = new Date(input.createdAt.getTime() - DUPLICATE_WINDOW_MINUTES * 60_000);
    const existing = await repo.findRecentDuplicate({ userId: input.userId, kind: input.kind, title, detail, since });
    if (existing) return existing;
  }
  return repo.create({ ...input, title, detail });
}

/** Who a rating notification says it is from: the buyer's first name when there is one, otherwise a neutral phrase. */
export function raterLabel(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return "A buyer";
  return first.slice(0, 40);
}

export interface RatingNotifier {
  /** Tells the Founder. Best effort: a failure here never undoes the rating. */
  ratingReceived(entry: BuyerEnquiry, change: "new" | "updated"): Promise<void>;
}

export interface RateEnquiryInput {
  userId: string;
  userName: string | null;
  enquiryId: unknown;
  rating: unknown;
  comment: unknown;
}

/**
 * Saves a buyer's rating of ONE of their own entries (they can change it later) and tells the Founder. The entry is found by the
 * owner's id, so a rating can never be placed on someone else's entry.
 */
export async function rateEnquiry(
  repo: BuyerEnquiryRepository,
  notifier: RatingNotifier | null,
  input: RateEnquiryInput,
  now: Date = new Date(),
): Promise<BuyerEnquiry> {
  if (typeof input.enquiryId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.enquiryId)) {
    throw new EnquiryRatingError("enquiry", "That enquiry could not be found.");
  }
  const { rating, comment } = validateRating({ rating: input.rating, comment: input.comment });
  const history = await repo.listForUser(input.userId, 500);
  const previous = history.find((e) => e.id === input.enquiryId);
  if (!previous) throw new EnquiryRatingError("enquiry", "That enquiry could not be found.");

  const saved = await repo.saveRating({
    userId: input.userId,
    id: previous.id,
    rating,
    comment,
    raterName: cleanText(input.userName, 80),
    ratedAt: now,
  });
  if (!saved) throw new EnquiryRatingError("enquiry", "That enquiry could not be found.");

  const unchanged = previous.rating === rating && (previous.comment ?? null) === comment;
  if (notifier && !unchanged) {
    try {
      await notifier.ratingReceived(saved, previous.rating === null ? "new" : "updated");
    } catch {
      // The rating is saved either way.
    }
  }
  return saved;
}

/** "5 stars · Excellent" */
export function ratingLabel(stars: number): string {
  return `${stars} ${stars === 1 ? "star" : "stars"} · ${STAR_LABELS[stars] ?? ""}`.trim();
}

export function toStarText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}
