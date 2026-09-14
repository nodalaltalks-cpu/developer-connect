import { randomUUID } from "node:crypto";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { inaccuracyReports, contactSubmissions, newsletterSubscribers } from "../../developer-connect/db/schema.ts";
import type {
  EngagementRepositories,
  InaccuracyReportRepository,
  ContactSubmissionRepository,
  NewsletterSubscriberRepository,
} from "../repository.ts";
import type { InaccuracyReport, ContactSubmission, NewsletterSubscriber } from "../types.ts";

/**
 * Lives in the SAME database as developer-connect's own tables (same
 * schema.ts, same getDb()) — no second database, no second connection
 * pool. Separated into its own repository module only because these
 * three concerns (reports/contact/newsletter) are a different bounded
 * context from the developer/verification domain, same reasoning as
 * notifications/ and profile/ each getting their own repository layer.
 */

function toReport(row: {
  id: string;
  developerId: string;
  category: InaccuracyReport["category"];
  details: string;
  reporterEmail: string | null;
  status: InaccuracyReport["status"];
  createdAt: Date;
  updatedAt: Date;
}): InaccuracyReport {
  return { ...row };
}

function toContact(row: {
  id: string;
  name: string;
  email: string;
  reason: ContactSubmission["reason"];
  message: string;
  userId: string | null;
  status: ContactSubmission["status"];
  createdAt: Date;
  updatedAt: Date;
}): ContactSubmission {
  return { ...row };
}

function toSubscriber(row: {
  id: string;
  email: string;
  status: NewsletterSubscriber["status"];
  source: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NewsletterSubscriber {
  return { ...row };
}

function buildReportRepository(): InaccuracyReportRepository {
  const db = getDb();
  return {
    async create(input) {
      const [row] = await db
        .insert(inaccuracyReports)
        .values({
          id: randomUUID(),
          developerId: input.developerId,
          category: input.category,
          details: input.details,
          reporterEmail: input.reporterEmail || null,
        })
        .returning();
      return toReport(row);
    },
    async list(limit = 200) {
      const rows = await db.select().from(inaccuracyReports).orderBy(desc(inaccuracyReports.createdAt)).limit(limit);
      return rows.map(toReport);
    },
    async updateStatus(id, status) {
      const [row] = await db
        .update(inaccuracyReports)
        .set({ status, updatedAt: new Date() })
        .where(eq(inaccuracyReports.id, id))
        .returning();
      return row ? toReport(row) : null;
    },
  };
}

function buildContactRepository(): ContactSubmissionRepository {
  const db = getDb();
  return {
    async create(input) {
      const [row] = await db
        .insert(contactSubmissions)
        .values({
          id: randomUUID(),
          name: input.name,
          email: input.email,
          reason: input.reason,
          message: input.message,
          userId: input.userId || null,
        })
        .returning();
      return toContact(row);
    },
    async list(limit = 200) {
      const rows = await db.select().from(contactSubmissions).orderBy(desc(contactSubmissions.createdAt)).limit(limit);
      return rows.map(toContact);
    },
    async updateStatus(id, status) {
      const [row] = await db
        .update(contactSubmissions)
        .set({ status, updatedAt: new Date() })
        .where(eq(contactSubmissions.id, id))
        .returning();
      return row ? toContact(row) : null;
    },
  };
}

function buildNewsletterRepository(): NewsletterSubscriberRepository {
  const db = getDb();
  return {
    async subscribe(input) {
      const existing = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.email, input.email));
      const already = existing[0];
      if (already && already.status === "SUBSCRIBED") {
        return { subscriber: toSubscriber(already), alreadySubscribed: true };
      }

      const [row] = await db
        .insert(newsletterSubscribers)
        .values({
          id: randomUUID(),
          email: input.email,
          source: input.source || null,
          userId: input.userId || null,
        })
        .onConflictDoUpdate({
          target: newsletterSubscribers.email,
          set: { status: "SUBSCRIBED", source: input.source || null, userId: input.userId || null, updatedAt: new Date() },
        })
        .returning();
      return { subscriber: toSubscriber(row), alreadySubscribed: false };
    },
    async list(limit = 500) {
      const rows = await db
        .select()
        .from(newsletterSubscribers)
        .orderBy(desc(newsletterSubscribers.createdAt))
        .limit(limit);
      return rows.map(toSubscriber);
    },
    async countActive() {
      const [row] = await db
        .select({ n: count() })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.status, "SUBSCRIBED"));
      return row?.n ?? 0;
    },
  };
}

export function createEngagementRepositories(): EngagementRepositories {
  return {
    reports: buildReportRepository(),
    contact: buildContactRepository(),
    newsletter: buildNewsletterRepository(),
  };
}
