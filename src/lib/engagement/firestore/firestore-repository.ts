import { randomUUID } from "node:crypto";
import { directCtx, type FsCtx } from "../../firestore/tx.ts";
import { monotonic, reqDate, safeId, toDate, toTs } from "../../firestore/convert.ts";
import type {
  ContactStatusHistoryRepository,
  ContactSubmissionRepository,
  EngagementRepositories,
  InaccuracyReportRepository,
  NewsletterSubscriberRepository,
} from "../repository.ts";
import type { ContactStatusHistoryEntry, ContactSubmission, InaccuracyReport, NewsletterSubscriber } from "../types.ts";

/**
 * Firestore adapter for reports, contact submissions (with trash), contact status history and the newsletter.
 * Collections: inaccuracyReports, contactSubmissions, contactStatusHistory, newsletterSubscribers.
 * A newsletter subscriber's document id IS the (encoded) email, which is what makes "one row per address" hold under
 * concurrent signups without a unique index.
 */

const EPOCH = toTs(new Date(0));

type Data = FirebaseFirestore.DocumentData;

const toReport = (id: string, d: Data): InaccuracyReport => ({
  id,
  developerId: d.developerId,
  category: d.category,
  details: d.details,
  reporterEmail: d.reporterEmail ?? null,
  status: d.status,
  createdAt: reqDate(d.createdAt),
  updatedAt: reqDate(d.updatedAt),
});

const toContact = (id: string, d: Data): ContactSubmission => ({
  id,
  name: d.name,
  email: d.email,
  reason: d.reason,
  message: d.message,
  userId: d.userId ?? null,
  status: d.status,
  createdAt: reqDate(d.createdAt),
  updatedAt: reqDate(d.updatedAt),
  deletedAt: toDate(d.deletedAt),
  deletedBy: d.deletedBy ?? null,
});

const toHistory = (id: string, d: Data): ContactStatusHistoryEntry => ({
  id,
  contactSubmissionId: d.contactSubmissionId,
  eventType: d.eventType,
  previousStatus: d.previousStatus ?? null,
  newStatus: d.newStatus ?? null,
  note: d.note ?? null,
  actorType: d.actorType,
  actorId: d.actorId,
  createdAt: reqDate(d.createdAt),
});

const toSubscriber = (id: string, d: Data): NewsletterSubscriber => ({
  id,
  email: d.email,
  status: d.status,
  source: d.source ?? null,
  userId: d.userId ?? null,
  createdAt: reqDate(d.createdAt),
  updatedAt: reqDate(d.updatedAt),
});

function withRange(q: FirebaseFirestore.Query, field: string, range?: { start: Date; end: Date }) {
  return range ? q.where(field, ">=", toTs(range.start)).where(field, "<", toTs(range.end)) : q;
}

function buildReportRepository(ctx: FsCtx): InaccuracyReportRepository {
  const col = () => ctx.db.collection("inaccuracyReports");
  return {
    async create(input) {
      const id = randomUUID();
      const now = new Date();
      const doc = {
        developerId: input.developerId,
        category: input.category,
        details: input.details,
        reporterEmail: input.reporterEmail || null,
        status: "NEW",
        createdAt: toTs(now),
        updatedAt: toTs(now),
      };
      await ctx.create(col().doc(id), doc);
      return toReport(id, { ...doc, createdAt: now, updatedAt: now });
    },
    async list(limit = 200, range) {
      const rows = await ctx.query(withRange(col(), "createdAt", range).orderBy("createdAt", "desc").limit(limit));
      return rows.map((v) => toReport(v.id, v.data()!));
    },
    async updateStatus(id, status) {
      const v = await ctx.get(col().doc(id));
      if (!v.exists) return null;
      const now = new Date();
      await ctx.update(col().doc(id), { status, updatedAt: toTs(now) });
      return toReport(id, { ...v.data()!, status, updatedAt: now });
    },
  };
}

function buildContactRepository(ctx: FsCtx): ContactSubmissionRepository {
  const col = () => ctx.db.collection("contactSubmissions");
  return {
    async create(input) {
      const id = randomUUID();
      const now = new Date();
      const doc = {
        name: input.name,
        email: input.email,
        reason: input.reason,
        message: input.message,
        userId: input.userId || null,
        status: "OPEN",
        createdAt: toTs(now),
        updatedAt: toTs(now),
        deletedAt: null,
        deletedBy: null,
      };
      await ctx.create(col().doc(id), doc);
      return toContact(id, { ...doc, createdAt: now, updatedAt: now });
    },
    async list(limit = 200) {
      const rows = await ctx.query(col().where("deletedAt", "==", null).orderBy("createdAt", "desc").limit(limit));
      return rows.map((v) => toContact(v.id, v.data()!));
    },
    async listTrash(limit = 200, range) {
      // "deleted" = deletedAt is a real timestamp; an active row holds null, which a `>` comparison never matches.
      const q = range
        ? col().where("deletedAt", ">=", toTs(range.start)).where("deletedAt", "<", toTs(range.end))
        : col().where("deletedAt", ">", EPOCH);
      const rows = await ctx.query(q.orderBy("deletedAt", "desc").limit(limit));
      return rows.map((v) => toContact(v.id, v.data()!));
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? toContact(id, v.data()!) : null;
    },
    async updateStatus(id, status) {
      const v = await ctx.get(col().doc(id));
      if (!v.exists) return null;
      const now = new Date();
      await ctx.update(col().doc(id), { status, updatedAt: toTs(now) });
      return toContact(id, { ...v.data()!, status, updatedAt: now });
    },
    async softDelete(id, deletedBy) {
      const v = await ctx.get(col().doc(id));
      if (!v.exists || v.data()!.deletedAt != null) return null;
      const now = new Date();
      await ctx.update(col().doc(id), { deletedAt: toTs(now), deletedBy, updatedAt: toTs(now) });
      return toContact(id, { ...v.data()!, deletedAt: now, deletedBy, updatedAt: now });
    },
    async restore(id) {
      const v = await ctx.get(col().doc(id));
      if (!v.exists || v.data()!.deletedAt == null) return null;
      const now = new Date();
      await ctx.update(col().doc(id), { deletedAt: null, deletedBy: null, updatedAt: toTs(now) });
      return toContact(id, { ...v.data()!, deletedAt: null, deletedBy: null, updatedAt: now });
    },
    async permanentDelete(id) {
      // Only a submission already in Trash can be destroyed.
      const v = await ctx.get(col().doc(id));
      if (!v.exists || v.data()!.deletedAt == null) return false;
      await ctx.delete(col().doc(id));
      return true;
    },
  };
}

function buildContactHistoryRepository(ctx: FsCtx): ContactStatusHistoryRepository {
  const col = () => ctx.db.collection("contactStatusHistory");
  return {
    async append(input) {
      const id = randomUUID();
      const now = new Date();
      const doc = {
        contactSubmissionId: input.contactSubmissionId,
        eventType: input.eventType,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        note: input.note ?? null,
        actorType: input.actorType,
        actorId: input.actorId,
        createdAt: toTs(now),
        _ord: monotonic(),
      };
      await ctx.create(col().doc(id), doc);
      return toHistory(id, { ...doc, createdAt: now });
    },
    async listBySubmission(contactSubmissionId) {
      const rows = await ctx.query(col().where("contactSubmissionId", "==", contactSubmissionId).orderBy("createdAt", "desc").orderBy("_ord", "desc"));
      return rows.map((v) => toHistory(v.id, v.data()!));
    },
  };
}

function buildNewsletterRepository(ctx: FsCtx): NewsletterSubscriberRepository {
  const col = () => ctx.db.collection("newsletterSubscribers");
  return {
    async subscribe(input) {
      return ctx.run(async (c) => {
        const ref = c.db.collection("newsletterSubscribers").doc(safeId(input.email));
        const existing = await c.get(ref);
        if (existing.exists && existing.data()!.status === "SUBSCRIBED") {
          return { subscriber: toSubscriber(ref.id, existing.data()!), alreadySubscribed: true };
        }
        const now = new Date();
        // A returning (unsubscribed) address keeps its original row and signup date, exactly like the upsert did.
        const doc = {
          email: input.email,
          status: "SUBSCRIBED",
          source: input.source || null,
          userId: input.userId || null,
          createdAt: existing.exists ? existing.data()!.createdAt : toTs(now),
          updatedAt: toTs(now),
        };
        await c.set(ref, doc);
        return { subscriber: toSubscriber(ref.id, { ...doc, createdAt: existing.exists ? reqDate(existing.data()!.createdAt) : now, updatedAt: now }), alreadySubscribed: false };
      });
    },
    async list(limit = 500, range) {
      const rows = await ctx.query(withRange(col(), "createdAt", range).orderBy("createdAt", "desc").limit(limit));
      return rows.map((v) => toSubscriber(v.id, v.data()!));
    },
    async countActive() {
      return (await col().where("status", "==", "SUBSCRIBED").count().get()).data().count;
    },
  };
}

export function buildFirestoreEngagementRepositories(ctx: FsCtx): EngagementRepositories {
  return {
    reports: buildReportRepository(ctx),
    contact: buildContactRepository(ctx),
    contactHistory: buildContactHistoryRepository(ctx),
    newsletter: buildNewsletterRepository(ctx),
    runInTransaction: (fn) => ctx.run((c) => fn(buildFirestoreEngagementRepositories(c))),
  };
}

export function createFirestoreEngagementRepositories(): EngagementRepositories {
  return buildFirestoreEngagementRepositories(directCtx());
}
