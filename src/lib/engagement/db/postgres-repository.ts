import { randomUUID } from "node:crypto";
import { and, count, desc, eq, isNull, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import { inaccuracyReports, contactSubmissions, contactStatusHistory, newsletterSubscribers } from "../../developer-connect/db/schema.ts";
import type {
  EngagementRepositories,
  InaccuracyReportRepository,
  ContactSubmissionRepository,
  ContactStatusHistoryRepository,
  NewsletterSubscriberRepository,
} from "../repository.ts";
import type { InaccuracyReport, ContactSubmission, ContactStatusHistoryEntry, NewsletterSubscriber } from "../types.ts";

/**
 * Lives in the SAME database as developer-connect's own tables (same
 * schema.ts, same getDb()) — no second database, no second connection
 * pool. Separated into its own repository module only because these
 * concerns (reports/contact/contact history/newsletter) are a different
 * bounded context from the developer/verification domain, same reasoning
 * as notifications/ and profile/ each getting their own repository layer.
 */

type DbOrTx = NodePgDatabase<typeof schema>;

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
  deletedAt: Date | null;
  deletedBy: string | null;
}): ContactSubmission {
  return { ...row };
}

function toHistory(row: {
  id: string;
  contactSubmissionId: string;
  eventType: ContactStatusHistoryEntry["eventType"];
  previousStatus: ContactStatusHistoryEntry["previousStatus"];
  newStatus: ContactStatusHistoryEntry["newStatus"];
  note: string | null;
  actorType: ContactStatusHistoryEntry["actorType"];
  actorId: string;
  createdAt: Date;
}): ContactStatusHistoryEntry {
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

function buildReportRepository(db: DbOrTx): InaccuracyReportRepository {
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

function buildContactRepository(db: DbOrTx): ContactSubmissionRepository {
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
      const rows = await db
        .select()
        .from(contactSubmissions)
        .where(isNull(contactSubmissions.deletedAt))
        .orderBy(desc(contactSubmissions.createdAt))
        .limit(limit);
      return rows.map(toContact);
    },
    async listTrash(limit = 200) {
      const rows = await db
        .select()
        .from(contactSubmissions)
        .where(isNotNull(contactSubmissions.deletedAt))
        .orderBy(desc(contactSubmissions.deletedAt))
        .limit(limit);
      return rows.map(toContact);
    },
    async getById(id) {
      const [row] = await db.select().from(contactSubmissions).where(eq(contactSubmissions.id, id));
      return row ? toContact(row) : null;
    },
    async updateStatus(id, status) {
      const [row] = await db
        .update(contactSubmissions)
        .set({ status, updatedAt: new Date() })
        .where(eq(contactSubmissions.id, id))
        .returning();
      return row ? toContact(row) : null;
    },
    async softDelete(id, deletedBy) {
      const [row] = await db
        .update(contactSubmissions)
        .set({ deletedAt: new Date(), deletedBy, updatedAt: new Date() })
        .where(and(eq(contactSubmissions.id, id), isNull(contactSubmissions.deletedAt)))
        .returning();
      return row ? toContact(row) : null;
    },
    async restore(id) {
      const [row] = await db
        .update(contactSubmissions)
        .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
        .where(and(eq(contactSubmissions.id, id), isNotNull(contactSubmissions.deletedAt)))
        .returning();
      return row ? toContact(row) : null;
    },
    async permanentDelete(id) {
      const rows = await db
        .delete(contactSubmissions)
        .where(and(eq(contactSubmissions.id, id), isNotNull(contactSubmissions.deletedAt)))
        .returning({ id: contactSubmissions.id });
      return rows.length > 0;
    },
  };
}

function buildContactHistoryRepository(db: DbOrTx): ContactStatusHistoryRepository {
  return {
    async append(input) {
      const [row] = await db
        .insert(contactStatusHistory)
        .values({
          id: randomUUID(),
          contactSubmissionId: input.contactSubmissionId,
          eventType: input.eventType,
          previousStatus: input.previousStatus ?? null,
          newStatus: input.newStatus ?? null,
          note: input.note ?? null,
          actorType: input.actorType,
          actorId: input.actorId,
        })
        .returning();
      return toHistory(row);
    },
    async listBySubmission(contactSubmissionId) {
      const rows = await db
        .select()
        .from(contactStatusHistory)
        .where(eq(contactStatusHistory.contactSubmissionId, contactSubmissionId))
        .orderBy(desc(contactStatusHistory.createdAt));
      return rows.map(toHistory);
    },
  };
}

function buildNewsletterRepository(db: DbOrTx): NewsletterSubscriberRepository {
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

/**
 * Exported (unlike developer-connect's own private `buildRepositories`)
 * because contact-service.ts's status-change transaction needs to bind
 * BOTH this module's repositories AND the notifications repository to the
 * exact same `tx` handle — something `runInTransaction` alone can't do
 * without engagement importing from notifications. See contact-service.ts
 * for where this is actually used.
 */
export function buildEngagementRepositories(db: DbOrTx): EngagementRepositories {
  return {
    reports: buildReportRepository(db),
    contact: buildContactRepository(db),
    contactHistory: buildContactHistoryRepository(db),
    newsletter: buildNewsletterRepository(db),
    async runInTransaction(fn) {
      // node-postgres transactions nest via SAVEPOINT automatically when
      // `db.transaction` is called while already inside one — same
      // reasoning as DeveloperConnectRepositories.runInTransaction.
      return db.transaction((tx) => fn(buildEngagementRepositories(tx)));
    },
  };
}

export function createEngagementRepositories(): EngagementRepositories {
  return buildEngagementRepositories(getDb());
}
