import { randomUUID } from "node:crypto";
import { getFirestoreDb } from "../../firestore/client.ts";
import { reqDate, toDate, toTs } from "../../firestore/convert.ts";
import type { Notification } from "../types.ts";
import type { NotificationRepository } from "../repository.ts";

const COLLECTION = "notifications";

function toNotification(id: string, d: FirebaseFirestore.DocumentData): Notification {
  return {
    id,
    userId: d.userId,
    type: d.type,
    title: d.title,
    body: d.body,
    targetRoute: d.targetRoute ?? null,
    read: d.read === true,
    createdAt: reqDate(d.createdAt),
    readAt: toDate(d.readAt),
  };
}

/** Firestore adapter for the same contract as the Postgres one. Composite indexes needed: see firestore.indexes.json. */
export function createFirestoreNotificationRepository(): NotificationRepository {
  const col = () => getFirestoreDb().collection(COLLECTION);

  return {
    async create(input) {
      const id = randomUUID();
      const createdAt = new Date();
      const data = {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        targetRoute: input.targetRoute ?? null,
        read: false,
        createdAt: toTs(createdAt),
        readAt: null,
      };
      await col().doc(id).create(data);
      return toNotification(id, { ...data, createdAt });
    },
    async listForUser(userId, limit = 20) {
      const snap = await col().where("userId", "==", userId).orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => toNotification(d.id, d.data()));
    },
    async countUnreadForUser(userId) {
      const agg = await col().where("userId", "==", userId).where("read", "==", false).count().get();
      return agg.data().count;
    },
    async markRead(id, userId) {
      const ref = col().doc(id);
      return getFirestoreDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()!.userId !== userId) return null;
        const readAt = new Date();
        tx.update(ref, { read: true, readAt: toTs(readAt) });
        return toNotification(id, { ...snap.data()!, read: true, readAt });
      });
    },
    async markAllRead(userId) {
      const snap = await col().where("userId", "==", userId).where("read", "==", false).get();
      const readAt = toTs(new Date());
      const db = getFirestoreDb();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { read: true, readAt });
        await batch.commit();
      }
      return snap.size;
    },
    async hasUnreadOfType(userId, type) {
      const snap = await col().where("userId", "==", userId).where("type", "==", type).where("read", "==", false).limit(1).get();
      return !snap.empty;
    },
    async findUnreadByTarget(userId, targetRoute) {
      const snap = await col().where("userId", "==", userId).where("targetRoute", "==", targetRoute).where("read", "==", false).limit(1).get();
      return snap.empty ? null : toNotification(snap.docs[0].id, snap.docs[0].data());
    },
    async listByType(type, limit = 50, range) {
      let q = col().where("type", "==", type);
      if (range) q = q.where("createdAt", ">=", toTs(range.start)).where("createdAt", "<", toTs(range.end));
      const snap = await q.orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => toNotification(d.id, d.data()));
    },
  };
}
