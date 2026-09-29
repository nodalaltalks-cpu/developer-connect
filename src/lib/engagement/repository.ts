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
  /**
   * Newest first — the Founder's /admin/reports queue. `range`, when
   * given, filters to reports SUBMITTED (createdAt) within
   * `[range.start, range.end)` — the Founder Dashboard's global date
   * filter; omitted, returns the full all-time list exactly as before.
   */
  list(limit?: number, range?: { start: Date; end: Date }): Promise<InaccuracyReport[]>;
  updateStatus(id: string, status: InaccuracyReportStatus): Promise<InaccuracyReport | null>;
}

export interface ContactSubmissionRepository {
  create(input: NewContactSubmissionInput): Promise<ContactSubmission>;
  /** Active (deletedAt IS NULL) submissions only, newest first — the default /admin/contact list. */
  list(limit?: number): Promise<ContactSubmission[]>;
  /**
   * Soft-deleted (deletedAt IS NOT NULL) submissions only, newest-deleted
   * first — the Trash view. `range`, when given, filters to items that
   * ENTERED Trash (deletedAt — never createdAt, which would answer a
   * different question: when the request was originally submitted, not
   * when it was deleted) within `[range.start, range.end)`.
   */
  listTrash(limit?: number, range?: { start: Date; end: Date }): Promise<ContactSubmission[]>;
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
  /** Newest first. `range`, when given, filters to signups (createdAt) within `[range.start, range.end)` — the global date filter; the CURRENT active-subscriber count (`countActive`) below is never affected by it. */
  list(limit?: number, range?: { start: Date; end: Date }): Promise<NewsletterSubscriber[]>;
  /** Current, live count of SUBSCRIBED rows — always a snapshot, deliberately never date-filtered. */
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
