import type {
  InaccuracyReport,
  NewInaccuracyReportInput,
  InaccuracyReportStatus,
  ContactSubmission,
  NewContactSubmissionInput,
  ContactStatus,
  NewsletterSubscriber,
  NewNewsletterSubscriberInput,
} from "./types.ts";

export interface InaccuracyReportRepository {
  create(input: NewInaccuracyReportInput): Promise<InaccuracyReport>;
  /** Newest first — the Founder's /admin/reports queue. */
  list(limit?: number): Promise<InaccuracyReport[]>;
  updateStatus(id: string, status: InaccuracyReportStatus): Promise<InaccuracyReport | null>;
}

export interface ContactSubmissionRepository {
  create(input: NewContactSubmissionInput): Promise<ContactSubmission>;
  list(limit?: number): Promise<ContactSubmission[]>;
  updateStatus(id: string, status: ContactStatus): Promise<ContactSubmission | null>;
}

export interface NewsletterSubscriberRepository {
  /**
   * Upserts by email: a repeat signup with the same address re-subscribes
   * (status back to SUBSCRIBED) rather than creating a duplicate row, so
   * the Founder's subscriber count is always a real distinct-person count.
   */
  subscribe(input: NewNewsletterSubscriberInput): Promise<{ subscriber: NewsletterSubscriber; alreadySubscribed: boolean }>;
  list(limit?: number): Promise<NewsletterSubscriber[]>;
  countActive(): Promise<number>;
}

export interface EngagementRepositories {
  reports: InaccuracyReportRepository;
  contact: ContactSubmissionRepository;
  newsletter: NewsletterSubscriberRepository;
}
