import { randomUUID } from "node:crypto";
import type {
  EngagementRepositories,
  InaccuracyReportRepository,
  ContactSubmissionRepository,
  ContactStatusHistoryRepository,
  NewsletterSubscriberRepository,
} from "./repository.ts";
import type { InaccuracyReport, ContactSubmission, ContactStatusHistoryEntry, NewsletterSubscriber } from "./types.ts";

export function createInMemoryEngagementRepositories(): EngagementRepositories {
  const reports = new Map<string, InaccuracyReport>();
  const contacts = new Map<string, ContactSubmission>();
  const contactHistoryRows = new Map<string, ContactStatusHistoryEntry>();
  const subscribers = new Map<string, NewsletterSubscriber>(); // keyed by email

  const reportRepository: InaccuracyReportRepository = {
    async create(input) {
      const now = new Date();
      const record: InaccuracyReport = {
        id: randomUUID(),
        developerId: input.developerId,
        category: input.category,
        details: input.details,
        reporterEmail: input.reporterEmail ?? null,
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      };
      reports.set(record.id, record);
      return record;
    },
    async list(limit = 200) {
      return [...reports.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    },
    async updateStatus(id, status) {
      const existing = reports.get(id);
      if (!existing) return null;
      const updated = { ...existing, status, updatedAt: new Date() };
      reports.set(id, updated);
      return updated;
    },
  };

  const contactRepository: ContactSubmissionRepository = {
    async create(input) {
      const now = new Date();
      const record: ContactSubmission = {
        id: randomUUID(),
        name: input.name,
        email: input.email,
        reason: input.reason,
        message: input.message,
        userId: input.userId ?? null,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      };
      contacts.set(record.id, record);
      return record;
    },
    async list(limit = 200) {
      return [...contacts.values()]
        .filter((c) => c.deletedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async listTrash(limit = 200) {
      return [...contacts.values()]
        .filter((c) => c.deletedAt !== null)
        .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime())
        .slice(0, limit);
    },
    async getById(id) {
      return contacts.get(id) ?? null;
    },
    async updateStatus(id, status) {
      const existing = contacts.get(id);
      if (!existing) return null;
      const updated = { ...existing, status, updatedAt: new Date() };
      contacts.set(id, updated);
      return updated;
    },
    async softDelete(id, deletedBy) {
      const existing = contacts.get(id);
      if (!existing || existing.deletedAt !== null) return null;
      const updated = { ...existing, deletedAt: new Date(), deletedBy, updatedAt: new Date() };
      contacts.set(id, updated);
      return updated;
    },
    async restore(id) {
      const existing = contacts.get(id);
      if (!existing || existing.deletedAt === null) return null;
      const updated = { ...existing, deletedAt: null, deletedBy: null, updatedAt: new Date() };
      contacts.set(id, updated);
      return updated;
    },
    async permanentDelete(id) {
      const existing = contacts.get(id);
      if (!existing || existing.deletedAt === null) return false;
      contacts.delete(id);
      return true;
    },
  };

  const contactHistoryRepository: ContactStatusHistoryRepository = {
    async append(input) {
      const record: ContactStatusHistoryEntry = {
        id: randomUUID(),
        contactSubmissionId: input.contactSubmissionId,
        eventType: input.eventType,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        note: input.note ?? null,
        actorType: input.actorType,
        actorId: input.actorId,
        createdAt: new Date(),
      };
      contactHistoryRows.set(record.id, record);
      return record;
    },
    async listBySubmission(contactSubmissionId) {
      return [...contactHistoryRows.values()]
        .filter((h) => h.contactSubmissionId === contactSubmissionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };

  const newsletterRepository: NewsletterSubscriberRepository = {
    async subscribe(input) {
      const existing = subscribers.get(input.email);
      if (existing && existing.status === "SUBSCRIBED") {
        return { subscriber: existing, alreadySubscribed: true };
      }
      const now = new Date();
      const record: NewsletterSubscriber = {
        id: existing?.id ?? randomUUID(),
        email: input.email,
        status: "SUBSCRIBED",
        source: input.source ?? null,
        userId: input.userId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      subscribers.set(input.email, record);
      return { subscriber: record, alreadySubscribed: false };
    },
    async list(limit = 500) {
      return [...subscribers.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    },
    async countActive() {
      return [...subscribers.values()].filter((s) => s.status === "SUBSCRIBED").length;
    },
  };

  const repositories: EngagementRepositories = {
    reports: reportRepository,
    contact: contactRepository,
    contactHistory: contactHistoryRepository,
    newsletter: newsletterRepository,
    async runInTransaction(fn) {
      return fn(repositories);
    },
  };
  return repositories;
}
