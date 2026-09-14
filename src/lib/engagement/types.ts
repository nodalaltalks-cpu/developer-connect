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
export type ContactStatus = "NEW" | "READ" | "RESPONDED" | "CLOSED";

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
}

export interface NewContactSubmissionInput {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  userId?: string | null;
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
