import { FieldPath } from "firebase-admin/firestore";
import { getFirestoreDb } from "../../firestore/client.ts";
import { reqDate, toTs } from "../../firestore/convert.ts";
import type { Profile } from "../types.ts";
import type { ProfileRepository } from "../repository.ts";

const COLLECTION = "profiles";

function toProfile(userId: string, d: FirebaseFirestore.DocumentData): Profile {
  return { userId, data: (d.data ?? {}) as Record<string, unknown>, createdAt: reqDate(d.createdAt), updatedAt: reqDate(d.updatedAt) };
}

export function createFirestoreProfileRepository(): ProfileRepository {
  const col = () => getFirestoreDb().collection(COLLECTION);

  return {
    async getByUserId(userId) {
      const snap = await col().doc(userId).get();
      return snap.exists ? toProfile(userId, snap.data()!) : null;
    },
    async getManyByUserIds(userIds) {
      if (userIds.length === 0) return [];
      const out: Profile[] = [];
      // Firestore `in` queries take at most 30 values.
      for (let i = 0; i < userIds.length; i += 30) {
        const snap = await col().where(FieldPath.documentId(), "in", userIds.slice(i, i + 30)).get();
        for (const d of snap.docs) out.push(toProfile(d.id, d.data()));
      }
      return out;
    },
    async createIfMissing(userId) {
      const ref = col().doc(userId);
      return getFirestoreDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return toProfile(userId, snap.data()!);
        const now = new Date();
        tx.create(ref, { data: {}, createdAt: toTs(now), updatedAt: toTs(now) });
        return { userId, data: {}, createdAt: now, updatedAt: now };
      });
    },
    async updateFields(userId, patch) {
      const ref = col().doc(userId);
      return getFirestoreDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = new Date();
        // Shallow merge, exactly like the JSONB `||` operator: keys absent from the patch are left as they were.
        const data = { ...((snap.data()?.data as Record<string, unknown> | undefined) ?? {}), ...patch };
        const createdAt = snap.exists ? reqDate(snap.data()!.createdAt) : now;
        tx.set(ref, { data, createdAt: toTs(createdAt), updatedAt: toTs(now) });
        return { userId, data, createdAt, updatedAt: now };
      });
    },
  };
}
