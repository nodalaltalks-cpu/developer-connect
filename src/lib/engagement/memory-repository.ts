import { randomUUID } from "node:crypto";
import type {
  EngagementRepositories,
  InaccuracyReportRepository,
  ContactSubmissionRepository,
  NewsletterSubscriberRepository,
} from "./repository.ts";
import type { InaccuracyReport, ContactSubmission, NewsletterSubscriber } from "./types.ts";

export function createInMemoryEngagementRepositories(): EngagementRepositories {
  const reports = new Map<string, InaccuracyReport>();
  const contacts = new Map<string, ContactSubmission>();
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
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      };
      contacts.set(record.id, record);
      return record;
    },
    async list(limit = 200) {
      return [...contacts.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    },
    async updateStatus(id, status) {
      const existing = contacts.get(id);
      if (!existing) return null;
      const updated = { ...existing, status, updatedAt: new Date() };
      contacts.set(id, updated);
      return updated;
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

  return { reports: reportRepository, contact: contactRepository, newsletter: newsletterRepository };
}
