import type {
  InaccuracyReport,
  NewInaccuracyReportInput,
  InaccuracyReportStatus,
  ContactSubmission,
  NewContactSubmissionInput,
  ContactStatus,
  ContactStatusHistoryEntry,
  NewContactStatusHistoryInput,
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
  /** Active (deletedAt IS NULL) submissions only, newest first — the default /admin/contact list. */
  list(limit?: number): Promise<ContactSubmission[]>;
  /** Soft-deleted (deletedAt IS NOT NULL) submissions only, newest-deleted first — the Trash view. */
  listTrash(limit?: number): Promise<ContactSubmission[]>;
  getById(id: string): Promise<ContactSubmission | null>;
  updateStatus(id: string, status: ContactStatus): Promise<ContactSubmission | null>;
  /** Sets deletedAt/deletedBy — never removes the row. */
  softDelete(id: string, deletedBy: string): Promise<ContactSubmission | null>;
  /** Clears deletedAt/deletedBy, returning the submission to the active list. */
  restore(id: string): Promise<ContactSubmission | null>;
  /** A real, irreversible DELETE. Only ever called after Founder confirmation + authorization, from Trash. */
  permanentDelete(id: string): Promise<boolean>;
}

export interface ContactStatusHistoryRepository {
  append(input: NewContactStatusHistoryInput): Promise<ContactStatusHistoryEntry>;
  /** Newest first. */
  listBySubmission(contactSubmissionId: string): Promise<ContactStatusHistoryEntry[]>;
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
  contactHistory: ContactStatusHistoryRepository;
  newsletter: NewsletterSubscriberRepository;
  /** Same composable-transaction contract as DeveloperConnectRepositories.runInTransaction — a Contact status change and its history/notification writes must commit or fail together (Part 31 of the task this implements). */
  runInTransaction<T>(fn: (repos: EngagementRepositories) => Promise<T>): Promise<T>;
}
