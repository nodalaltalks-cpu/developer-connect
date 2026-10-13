import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, gt, isNotNull, isNull, lte, max, sql } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { buyerEnquiries } from "../../developer-connect/db/schema.ts";
import type { BuyerEnquiryRepository } from "../repository.ts";
import type { BuyerEnquiry, EnquiryKind, RatingSummary } from "../types.ts";

function toEntry(row: typeof buyerEnquiries.$inferSelect): BuyerEnquiry {
  return {
    id: row.id,
    userId: row.userId,
    leadId: row.leadId ?? null,
    kind: row.kind as EnquiryKind,
    developerId: row.developerId ?? null,
    title: row.title,
    detail: row.detail ?? null,
    raterName: row.raterName ?? null,
    createdAt: row.createdAt,
    rating: row.rating ?? null,
    comment: row.comment ?? null,
    ratedAt: row.ratedAt ?? null,
    seenAt: row.seenAt ?? null,
  };
}

export function createPostgresBuyerEnquiryRepository(db = getDb()): BuyerEnquiryRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(buyerEnquiries)
        .values({
          id: randomUUID(),
          userId: input.userId,
          leadId: input.leadId ?? null,
          kind: input.kind,
          developerId: input.developerId ?? null,
          title: input.title,
          detail: input.detail ?? null,
          createdAt: input.createdAt,
        })
        .returning();
      return toEntry(row);
    },

    async findRecentDuplicate({ userId, kind, title, detail, since }) {
      const [row] = await db
        .select()
        .from(buyerEnquiries)
        .where(
          and(
            eq(buyerEnquiries.userId, userId),
            eq(buyerEnquiries.kind, kind),
            eq(buyerEnquiries.title, title),
            detail === null ? isNull(buyerEnquiries.detail) : eq(buyerEnquiries.detail, detail),
            gte(buyerEnquiries.createdAt, since),
          ),
        )
        .orderBy(desc(buyerEnquiries.createdAt))
        .limit(1);
      return row ? toEntry(row) : null;
    },

    async listForUser(userId, limit = 100) {
      const rows = await db.select().from(buyerEnquiries).where(eq(buyerEnquiries.userId, userId)).orderBy(desc(buyerEnquiries.createdAt)).limit(limit);
      return rows.map(toEntry);
    },

    async saveRating({ userId, id, rating, comment, raterName, ratedAt }) {
      // Ownership is part of the WHERE clause: another user's entry id simply matches nothing.
      const [row] = await db
        .update(buyerEnquiries)
        .set({ rating, comment, raterName, ratedAt, seenAt: null })
        .where(and(eq(buyerEnquiries.id, id), eq(buyerEnquiries.userId, userId)))
        .returning();
      return row ? toEntry(row) : null;
    },

    async listRated({ limit = 100, maxStars, since } = {}) {
      const conditions = [isNotNull(buyerEnquiries.rating)];
      if (maxStars !== undefined) conditions.push(lte(buyerEnquiries.rating, maxStars));
      if (since) conditions.push(gt(buyerEnquiries.ratedAt, since));
      const rows = await db
        .select()
        .from(buyerEnquiries)
        .where(and(...conditions))
        .orderBy(desc(buyerEnquiries.ratedAt))
        .limit(limit);
      return rows.map(toEntry);
    },

    async summary(): Promise<RatingSummary> {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
          rated: sql<number>`count(${buyerEnquiries.rating})::int`,
          average: sql<string | null>`round(avg(${buyerEnquiries.rating})::numeric, 1)`,
          one: sql<number>`count(*) filter (where ${buyerEnquiries.rating} = 1)::int`,
          two: sql<number>`count(*) filter (where ${buyerEnquiries.rating} = 2)::int`,
          three: sql<number>`count(*) filter (where ${buyerEnquiries.rating} = 3)::int`,
          four: sql<number>`count(*) filter (where ${buyerEnquiries.rating} = 4)::int`,
          five: sql<number>`count(*) filter (where ${buyerEnquiries.rating} = 5)::int`,
          unseen: sql<number>`count(*) filter (where ${buyerEnquiries.rating} is not null and ${buyerEnquiries.seenAt} is null)::int`,
          attention: sql<number>`count(*) filter (where ${buyerEnquiries.rating} <= 3)::int`,
        })
        .from(buyerEnquiries);
      return {
        totalEnquiries: row?.total ?? 0,
        rated: row?.rated ?? 0,
        average: row?.average == null ? null : Number(row.average),
        distribution: [row?.one ?? 0, row?.two ?? 0, row?.three ?? 0, row?.four ?? 0, row?.five ?? 0],
        unseen: row?.unseen ?? 0,
        needsAttention: row?.attention ?? 0,
      };
    },

    async markAllSeen(now) {
      const rows = await db
        .update(buyerEnquiries)
        .set({ seenAt: now })
        .where(and(isNotNull(buyerEnquiries.rating), isNull(buyerEnquiries.seenAt)))
        .returning({ id: buyerEnquiries.id });
      return rows.length;
    },

    async latestRatedAt() {
      const [row] = await db.select({ latest: max(buyerEnquiries.ratedAt) }).from(buyerEnquiries);
      return row?.latest ?? null;
    },

    async scrubForLead(leadId) {
      const rows = await db
        .update(buyerEnquiries)
        .set({ comment: null, raterName: null })
        .where(eq(buyerEnquiries.leadId, leadId))
        .returning({ id: buyerEnquiries.id });
      return rows.length;
    },
  };
}
