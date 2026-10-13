import { randomUUID } from "node:crypto";
import type { BuyerEnquiryRepository } from "./repository.ts";
import type { BuyerEnquiry, RatingSummary } from "./types.ts";

/** In-memory repository for tests: the same contract as the Postgres one. */
export function createMemoryBuyerEnquiryRepository(): BuyerEnquiryRepository & { rows: BuyerEnquiry[] } {
  const rows: BuyerEnquiry[] = [];
  const copy = (e: BuyerEnquiry): BuyerEnquiry => ({ ...e });
  return {
    rows,
    async create(input) {
      const row: BuyerEnquiry = {
        id: randomUUID(),
        userId: input.userId,
        leadId: input.leadId ?? null,
        kind: input.kind,
        developerId: input.developerId ?? null,
        title: input.title,
        detail: input.detail ?? null,
        raterName: null,
        createdAt: input.createdAt,
        rating: null,
        comment: null,
        ratedAt: null,
        seenAt: null,
      };
      rows.push(row);
      return copy(row);
    },
    async findRecentDuplicate({ userId, kind, title, detail, since }) {
      const hit = rows.find((r) => r.userId === userId && r.kind === kind && r.title === title && (r.detail ?? null) === detail && r.createdAt >= since);
      return hit ? copy(hit) : null;
    },
    async listForUser(userId, limit = 100) {
      return rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(copy);
    },
    async saveRating({ userId, id, rating, comment, raterName, ratedAt }) {
      const row = rows.find((r) => r.id === id && r.userId === userId);
      if (!row) return null;
      row.rating = rating;
      row.comment = comment;
      row.raterName = raterName;
      row.ratedAt = ratedAt;
      row.seenAt = null;
      return copy(row);
    },
    async listRated({ limit = 100, maxStars, since } = {}) {
      return rows
        .filter((r) => r.rating !== null && (maxStars === undefined || (r.rating as number) <= maxStars) && (!since || (r.ratedAt as Date) > since))
        .sort((a, b) => (b.ratedAt as Date).getTime() - (a.ratedAt as Date).getTime())
        .slice(0, limit)
        .map(copy);
    },
    async summary(): Promise<RatingSummary> {
      const rated = rows.filter((r) => r.rating !== null);
      const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      for (const r of rated) distribution[(r.rating as number) - 1] += 1;
      const total = rated.reduce((sum, r) => sum + (r.rating as number), 0);
      return {
        totalEnquiries: rows.length,
        rated: rated.length,
        average: rated.length ? Math.round((total / rated.length) * 10) / 10 : null,
        distribution,
        unseen: rated.filter((r) => r.seenAt === null).length,
        needsAttention: rated.filter((r) => (r.rating as number) <= 3).length,
      };
    },
    async markAllSeen(now) {
      let n = 0;
      for (const r of rows) if (r.rating !== null && r.seenAt === null) { r.seenAt = now; n += 1; }
      return n;
    },
    async latestRatedAt() {
      const dates = rows.map((r) => r.ratedAt).filter((d): d is Date => d !== null);
      return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    },
    async scrubForLead(leadId) {
      let n = 0;
      for (const r of rows) if (r.leadId === leadId) { r.comment = null; r.raterName = null; n += 1; }
      return n;
    },
  };
}
