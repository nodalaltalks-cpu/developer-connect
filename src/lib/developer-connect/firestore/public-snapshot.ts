import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

/**
 * A stored copy of the published developer directory, kept in a handful of small documents.
 *
 * Why: every public page, the sitemap and each crawler hit needs the whole published list (about 1,240 developers). Reading
 * it from the developers collection costs one Firestore read per developer, every time a server instance refreshes, and
 * the free plan allows only 50,000 reads a day, so crawlers used the whole day's allowance. This copy is split into chunks
 * of CHUNK_SIZE developers, so a refresh costs about 17 reads instead of 1,240.
 *
 * It is a cache, never the source of truth: the developers collection is. Admin edits mark it stale (markSnapshotStale) and
 * it expires by itself after SNAPSHOT_MAX_AGE_MS, after which the next reader rebuilds it from the collection. A rebuild
 * writes every chunk and the meta document in ONE batch, so a reader never sees a half-written copy.
 */

const COLLECTION = "publicSnapshots";
const META = "published_meta";
const CHUNK_SIZE = 80;
export const SNAPSHOT_MAX_AGE_MS = 60 * 60_000;

export interface SnapshotRow {
  id: string;
  data: FirebaseFirestore.DocumentData;
}

const chunkRef = (db: Firestore, index: number) => db.collection(COLLECTION).doc(`published_${index}`);

/** The stored copy, or null when there is none, it is stale or expired, or it is incomplete. */
export async function readPublishedSnapshot(db: Firestore, now: number = Date.now()): Promise<SnapshotRow[] | null> {
  const meta = await db.collection(COLLECTION).doc(META).get();
  if (!meta.exists) return null;
  const m = meta.data() as { version?: string; chunks?: number; builtAt?: number } | undefined;
  if (!m || !m.version || typeof m.chunks !== "number" || !m.builtAt || now - m.builtAt > SNAPSHOT_MAX_AGE_MS) return null;
  const docs = await Promise.all(Array.from({ length: m.chunks }, (_, i) => chunkRef(db, i).get()));
  const rows: SnapshotRow[] = [];
  for (const doc of docs) {
    const body = doc.data() as { version?: string; items?: SnapshotRow[] } | undefined;
    if (!body || body.version !== m.version || !Array.isArray(body.items)) return null;
    rows.push(...body.items);
  }
  return rows;
}

/** Replaces the stored copy with `rows`, atomically. */
export async function writePublishedSnapshot(db: Firestore, rows: SnapshotRow[], now: number = Date.now()): Promise<void> {
  const version = randomUUID();
  const chunks = Math.ceil(rows.length / CHUNK_SIZE);
  const batch = db.batch();
  for (let i = 0; i < chunks; i += 1) {
    batch.set(chunkRef(db, i), { version, items: rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
  }
  batch.set(db.collection(COLLECTION).doc(META), { version, chunks, count: rows.length, builtAt: now });
  await batch.commit();
}

/** Makes the stored copy count as out of date, so the next reader rebuilds it from the developers collection. */
export async function markSnapshotStale(db: Firestore): Promise<void> {
  await db.collection(COLLECTION).doc(META).set({ builtAt: 0 }, { merge: true });
}
