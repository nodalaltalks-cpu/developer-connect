import { Timestamp, type CollectionReference, type DocumentData } from "firebase-admin/firestore";
import type { DocView, FsCtx, Where } from "../../firestore/tx.ts";

/**
 * Shared plumbing for the Firestore lead repositories.
 *
 * NAMESPACE: every collection name is prefixed with `ns`. Production uses "" (so the collections are plainly `leads`,
 * `leadEvents`, ...). The conformance tests pass a random prefix so each repository instance starts completely empty,
 * which is what lets the existing in-memory repository tests run unchanged against Firestore.
 *
 * DOCUMENT SHAPE: a domain object is stored as its own fields (Dates become Timestamps on write) with the id as the
 * document id. Anything the adapter adds for its own bookkeeping starts with an underscore (`_live`, `_seq`, ...) and
 * is stripped on read, so callers never see it.
 */

export interface Fs {
  ctx: FsCtx;
  ns: string;
  col(name: string): CollectionReference;
  /** The unique-key documents (phone numbers, one-open-follow-up pointers, ...). */
  lookup(key: string): FirebaseFirestore.DocumentReference;
}

export function makeFs(ctx: FsCtx, ns: string): Fs {
  return {
    ctx,
    ns,
    col: (name) => ctx.db.collection(`${ns}${name}`),
    lookup: (key) => ctx.db.collection(`${ns}lookups`).doc(key),
  };
}

/** Stored document -> domain object: Timestamps become Dates, bookkeeping (`_x`) fields are dropped, the id is attached. */
export function decode<T>(view: DocView | { id: string; data(): DocumentData | undefined }): T {
  const out: Record<string, unknown> = { id: view.id };
  for (const [k, v] of Object.entries(view.data() ?? {})) {
    if (k.startsWith("_")) continue;
    out[k] = v instanceof Timestamp ? v.toDate() : v;
  }
  return out as T;
}

/** Domain object -> stored document (the id is the document id, not a field). */
export function encode(obj: object, extra: DocumentData = {}): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "id" || v === undefined) continue;
    out[k] = v;
  }
  return { ...out, ...extra };
}

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Runs `fn` over `items` with at most `n` in flight. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Every document whose `field` is one of `ids` (Firestore's `in` takes 30 at a time). */
export async function findByIds(fs: Fs, collection: string, field: string, ids: string[], extra: Where[] = []): Promise<DocView[]> {
  const unique = [...new Set(ids)];
  const parts = await mapLimit(chunk(unique, 30), 6, (part) => fs.ctx.find(fs.col(collection), { where: [[field, "in", part], ...extra] }));
  return parts.flat();
}

/** Documents by id (a batched read), skipping the ones that do not exist. */
export async function getMany(fs: Fs, collection: string, ids: string[]): Promise<DocView[]> {
  const unique = [...new Set(ids)];
  const views = await mapLimit(unique, 10, (id) => fs.ctx.get(fs.col(collection).doc(id)));
  return views.filter((v) => v.exists);
}

export const EPOCH = new Date(0);
export const timeOf = (d: Date | null | undefined): number => (d ? d.getTime() : 0);
