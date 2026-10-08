import { createHash, randomBytes } from "node:crypto";

/**
 * Testimonials: the rules, with no database in sight.
 *
 * The one promise: a testimonial is public ONLY when a real person wrote it, said we may publish it, and the Founder approved
 * and published it. Everything below exists to make that impossible to get wrong.
 */

export const TESTIMONIAL_STATUSES = ["DRAFT", "SENT", "RECEIVED", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "ARCHIVED", "REJECTED"] as const;
export type TestimonialStatus = (typeof TESTIMONIAL_STATUSES)[number];

export const DISPLAY_MODES = ["FULL_NAME", "FIRST_NAME_LAST_INITIAL", "FIRST_NAME_ONLY", "ANONYMOUS"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const DISPLAY_MODE_LABEL: Record<DisplayMode, string> = {
  FULL_NAME: "Full name",
  FIRST_NAME_LAST_INITIAL: "First name and last initial",
  FIRST_NAME_ONLY: "First name only",
  ANONYMOUS: "Anonymous",
};

export const REQUEST_CHANNELS = ["WHATSAPP", "EMAIL", "LINK"] as const;
export type RequestChannel = (typeof REQUEST_CHANNELS)[number];

export interface Testimonial {
  id: string;
  status: TestimonialStatus;
  isIllustrative: boolean;
  scenario: string | null;
  requestTokenHash: string | null;
  requestedVia: RequestChannel | null;
  authorName: string | null;
  displayMode: DisplayMode;
  city: string | null;
  country: string | null;
  helpedWith: string | null;
  experience: string | null;
  project: string | null;
  rating: number | null;
  permissionPublish: boolean;
  leadId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  rejectReason: string | null;
}

/** Forward only. A Founder may reject a received one, and archive anything that is finished with. */
export const TRANSITIONS: Record<TestimonialStatus, readonly TestimonialStatus[]> = {
  DRAFT: ["SENT", "ARCHIVED"],
  SENT: ["RECEIVED", "ARCHIVED"],
  RECEIVED: ["PENDING_APPROVAL", "REJECTED", "ARCHIVED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
  REJECTED: ["ARCHIVED"],
};

export function canTransition(from: TestimonialStatus, to: TestimonialStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const ILLUSTRATIVE_LABEL = "ILLUSTRATIVE DRAFT — REQUIRES REAL CUSTOMER REPLACEMENT";

export const FIELD_LIMITS = { name: 120, place: 80, helpedWith: 500, experience: 2000, project: 120, scenario: 120 } as const;

// ---- the secret in the buyer's link ---------------------------------------------------------------------------------

/** A new request secret: 32 random bytes, URL-safe. Shown once to the Founder; only its hash is stored. */
export function newRequestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRequestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

// ---- what the public sees --------------------------------------------------------------------------------------------

/** The name as the author chose to be shown. An anonymous author is never named, and a missing name is never invented. */
export function displayName(input: { authorName: string | null; displayMode: DisplayMode }): string {
  const name = (input.authorName ?? "").trim().replace(/\s+/g, " ");
  if (!name || input.displayMode === "ANONYMOUS") return "A Developer Connects client";
  const parts = name.split(" ");
  if (input.displayMode === "FULL_NAME") return name;
  if (input.displayMode === "FIRST_NAME_ONLY" || parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Everything a public page may know about a published testimonial. No ids of people, no contact details, no internal fields. */
export interface PublicTestimonial {
  id: string;
  name: string;
  place: string | null;
  experience: string;
  helpedWith: string | null;
  project: string | null;
  publishedAt: Date;
}

export function toPublic(t: Testimonial): PublicTestimonial | null {
  if (t.status !== "PUBLISHED" || t.isIllustrative || !t.permissionPublish || !t.approvedAt || !t.publishedAt || !t.experience) return null;
  const place = [t.city, t.country].filter(Boolean).join(", ");
  return {
    id: t.id,
    name: displayName(t),
    place: place || null,
    experience: t.experience,
    helpedWith: t.helpedWith,
    project: t.project,
    publishedAt: t.publishedAt,
  };
}

// ---- what a buyer may submit -----------------------------------------------------------------------------------------

export interface SubmissionInput {
  name?: unknown;
  displayMode?: unknown;
  city?: unknown;
  country?: unknown;
  helpedWith?: unknown;
  experience?: unknown;
  project?: unknown;
  rating?: unknown;
  permissionPublish?: unknown;
}

export interface CleanSubmission {
  authorName: string;
  displayMode: DisplayMode;
  city: string | null;
  country: string | null;
  helpedWith: string | null;
  experience: string;
  project: string | null;
  rating: number | null;
  permissionPublish: boolean;
}

export class TestimonialValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  return cleaned.length > 0 ? cleaned.slice(0, max) : null;
};

/** Validates exactly what a buyer's form may carry. Honest feedback only: nothing here nudges toward a score. */
export function cleanSubmission(input: SubmissionInput): CleanSubmission {
  const authorName = text(input.name, FIELD_LIMITS.name);
  if (!authorName) throw new TestimonialValidationError("name", "Please tell us your name.");
  const experience = text(input.experience, FIELD_LIMITS.experience);
  if (!experience || experience.length < 20) throw new TestimonialValidationError("experience", "Please share a few sentences about your experience.");
  const displayMode = (DISPLAY_MODES as readonly string[]).includes(String(input.displayMode)) ? (input.displayMode as DisplayMode) : "ANONYMOUS";
  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== "") {
    const n = Number(input.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new TestimonialValidationError("rating", "A rating, if given, is a whole number from 1 to 5.");
    rating = n;
  }
  return {
    authorName,
    displayMode,
    city: text(input.city, FIELD_LIMITS.place),
    country: text(input.country, FIELD_LIMITS.place),
    helpedWith: text(input.helpedWith, FIELD_LIMITS.helpedWith),
    experience,
    project: text(input.project, FIELD_LIMITS.project),
    rating,
    // Only an explicit "yes" counts. Anything else (missing, "false", "on" typed by a bot) is a no.
    permissionPublish: input.permissionPublish === true || input.permissionPublish === "true" || input.permissionPublish === "yes",
  };
}

// ---- the request message the Founder shares --------------------------------------------------------------------------

export function requestMessage(input: { name?: string | null; link: string }): string {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim().split(" ")[0]}` : "Hi";
  return `${greeting}, thank you for trusting me with your property decision. If you are comfortable, I'd really appreciate a short, honest note about your experience with Developer Connects. You can share it here: ${input.link}`;
}

export function requestWhatsappHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function requestMailtoHref(message: string): string {
  return `mailto:?subject=${encodeURIComponent("Your experience with Developer Connects")}&body=${encodeURIComponent(message)}`;
}
