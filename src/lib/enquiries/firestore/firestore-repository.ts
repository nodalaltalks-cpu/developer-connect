import { randomUUID } from "node:crypto";
import { AggregateField } from "firebase-admin/firestore";
import { getFirestoreDb } from "../../firestore/client.ts";
import { reqDate, toDate, toTs } from "../../firestore/convert.ts";
import type { BuyerEnquiryRepository } from "../repository.ts";
import type { BuyerEnquiry, EnquiryKind, RatingSummary } from "../types.ts";

const COLLECTION = "buyerEnquiries";
/** An "is rated" test that needs no extra index: an unrated entry has ratedAt = null, which a `>` comparison never matches. */
const EPOCH = toTs(new Date(0));

function toEntry(id: string, d: FirebaseFirestore.DocumentData): BuyerEnquiry {
  return {
    id,
    userId: d.userId,
    leadId: d.leadId ?? null,
    kind: d.kind as EnquiryKind,
    developerId: d.developerId ?? null,
    title: d.title,
    detail: d.detail ?? null,
    raterName: d.raterName ?? null,
    createdAt: reqDate(d.createdAt),
    rating: d.rating ?? null,
    comment: d.comment ?? null,
    ratedAt: toDate(d.ratedAt),
    seenAt: toDate(d.seenAt),
  };
}

export function createFirestoreBuyerEnquiryRepository(): BuyerEnquiryRepository {
  const col = () => getFirestoreDb().collection(COLLECTION);
  const countOf = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

  return {
    async create(input) {
      const id = randomUUID();
      const data = {
        userId: input.userId,
        leadId: input.leadId ?? null,
        kind: input.kind,
        developerId: input.developerId ?? null,
        title: input.title,
        detail: input.detail ?? null,
        raterName: null,
        createdAt: toTs(input.createdAt),
        rating: null,
        comment: null,
        ratedAt: null,
        seenAt: null,
      };
      await col().doc(id).create(data);
      return toEntry(id, { ...data, createdAt: input.createdAt });
    },

    async findRecentDuplicate({ userId, kind, title, detail, since }) {
      const snap = await col()
        .where("userId", "==", userId)
        .where("kind", "==", kind)
        .where("title", "==", title)
        .where("detail", "==", detail)
        .where("createdAt", ">=", toTs(since))
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      return snap.empty ? null : toEntry(snap.docs[0].id, snap.docs[0].data());
    },

    async listForUser(userId, limit = 100) {
      const snap = await col().where("userId", "==", userId).orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => toEntry(d.id, d.data()));
    },

    async saveRating({ userId, id, rating, comment, raterName, ratedAt }) {
      const ref = col().doc(id);
      return getFirestoreDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // Ownership is checked against the stored owner: another user's entry id simply yields null.
        if (!snap.exists || snap.data()!.userId !== userId) return null;
        const patch = { rating, comment, raterName, ratedAt: toTs(ratedAt), seenAt: null };
        tx.update(ref, patch);
        return toEntry(id, { ...snap.data()!, ...patch, ratedAt, seenAt: null });
      });
    },

    async listRated({ limit = 100, maxStars, since } = {}) {
      const floor = since ? toTs(since) : EPOCH;
      const out: BuyerEnquiry[] = [];
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      // maxStars is applied here rather than as a second range filter, so one simple index serves every caller.
      while (out.length < limit) {
        let q = col().where("ratedAt", ">", floor).orderBy("ratedAt", "desc").limit(Math.max(limit, 50));
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) break;
        for (const d of snap.docs) {
          const e = toEntry(d.id, d.data());
          if (maxStars === undefined || (e.rating !== null && e.rating <= maxStars)) out.push(e);
          if (out.length >= limit) break;
        }
        cursor = snap.docs[snap.docs.length - 1];
        if (snap.size < Math.max(limit, 50)) break;
      }
      return out;
    },

    async summary(): Promise<RatingSummary> {
      const rated = col().where("ratedAt", ">", EPOCH);
      const stars = (n: number) => countOf(col().where("rating", "==", n));
      const [total, ratedN, avg, one, two, three, four, five, unseen, attention] = await Promise.all([
        countOf(col()),
        countOf(rated),
        rated.aggregate({ avg: AggregateField.average("rating") }).get(),
        stars(1),
        stars(2),
        stars(3),
        stars(4),
        stars(5),
        countOf(col().where("ratedAt", ">", EPOCH).where("seenAt", "==", null)),
        countOf(col().where("rating", "<=", 3).where("rating", ">", 0)),
      ]);
      const average = avg.data().avg;
      return {
        totalEnquiries: total,
        rated: ratedN,
        average: average == null ? null : Math.round(average * 10) / 10,
        distribution: [one, two, three, four, five],
        unseen,
        needsAttention: attention,
      };
    },

    async markAllSeen(now) {
      const snap = await col().where("ratedAt", ">", EPOCH).where("seenAt", "==", null).get();
      const db = getFirestoreDb();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { seenAt: toTs(now) });
        await batch.commit();
      }
      return snap.size;
    },

    async latestRatedAt() {
      const snap = await col().where("ratedAt", ">", EPOCH).orderBy("ratedAt", "desc").limit(1).get();
      return snap.empty ? null : toDate(snap.docs[0].data().ratedAt);
    },

    async scrubForLead(leadId) {
      const snap = await col().where("leadId", "==", leadId).get();
      const db = getFirestoreDb();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { comment: null, raterName: null });
        await batch.commit();
      }
      return snap.size;
    },
  };
}
