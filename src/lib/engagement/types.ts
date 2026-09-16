/**
 * Three small, independent public-engagement concerns (Parts 24-29 of the
 * brand/UX task): a visitor flagging bad info on a developer page, a
 * general Contact Us message, and a newsletter signup. Deliberately kept
 * separate from developer-connect's domain (developers/website
 * candidates/verification) — these are about the PUBLIC visitor, not the
 * developer directory itself — mirroring how notifications/ and profile/
 * already get their own top-level lib directory rather than being folded
 * into developer-connect/.
 */

export type InaccuracyReportCategory = "OFFICIAL_WEBSITE" | "DEVELOPER_NAME" | "HEADQUARTERS" | "OTHER";
export type InaccuracyReportStatus = "NEW" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

export interface InaccuracyReport {
  id: string;
  developerId: string;
  category: InaccuracyReportCategory;
  details: string;
  reporterEmail: string | null;
  status: InaccuracyReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewInaccuracyReportInput {
  developerId: string;
  category: InaccuracyReportCategory;
  details: string;
  reporterEmail?: string | null;
}

export type ContactReason =
  | "GENERAL_QUESTION"
  | "REPORT_INACCURATE_INFO"
  | "DEVELOPER_LISTING"
  | "PARTNERSHIP"
  | "OTHER";

/**
 * Founder case-management lifecycle (replaces the original
 * NEW/READ/RESPONDED/CLOSED set — see schema.ts's contactStatusEnum
 * comment for why this was a genuine vocabulary change, not a duplicate
 * status system, and migration 0011 for how existing rows were carried
 * forward).
 */
export type ContactStatus = "OPEN" | "IN_REVIEW" | "ON_HOLD" | "RESOLVED" | "REJECTED";

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  userId: string | null;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Soft-delete (Trash) — non-null means this submission no longer appears in the active /admin/contact list. */
  deletedAt: Date | null;
  /** Founder's Clerk user id at the moment of soft-delete. Null when deletedAt is null. */
  deletedBy: string | null;
}

export interface NewContactSubmissionInput {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  userId?: string | null;
}

/** Mirrors developer_edit_events' shape for the same reason: one append-only event stream covering every kind of change to this record's lifecycle. */
export type ContactHistoryEventType = "STATUS_CHANGE" | "TRASHED" | "RESTORED" | "PERMANENT_DELETE";

export interface ContactStatusHistoryEntry {
  id: string;
  contactSubmissionId: string;
  eventType: ContactHistoryEventType;
  previousStatus: ContactStatus | null;
  newStatus: ContactStatus | null;
  note: string | null;
  actorType: "FOUNDER" | "SYSTEM" | "AGENT";
  actorId: string;
  createdAt: Date;
}

export interface NewContactStatusHistoryInput {
  contactSubmissionId: string;
  eventType: ContactHistoryEventType;
  previousStatus?: ContactStatus | null;
  newStatus?: ContactStatus | null;
  note?: string | null;
  actorType: "FOUNDER" | "SYSTEM" | "AGENT";
  actorId: string;
}

export type NewsletterStatus = "SUBSCRIBED" | "UNSUBSCRIBED";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: NewsletterStatus;
  source: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewNewsletterSubscriberInput {
  email: string;
  source?: string | null;
  userId?: string | null;
}
