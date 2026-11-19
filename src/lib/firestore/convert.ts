import { Timestamp } from "firebase-admin/firestore";

/** Date -> Firestore Timestamp (null/undefined stay null so "absent" has one representation). */
export function toTs(d: Date | null | undefined): Timestamp | null {
  return d ? Timestamp.fromDate(d) : null;
}

/** Firestore Timestamp (or already a Date) -> Date. */
export function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

export function reqDate(v: unknown): Date {
  const d = toDate(v);
  if (!d) throw new Error("Expected a timestamp in the stored document.");
  return d;
}

/**
 * A strictly increasing number (microseconds since the epoch, bumped when two calls land in the same microsecond), used
 * to keep records written in one transaction (which share a timestamp) in the order they were written. Stored as `_ord`
 * on history rows so a read can order by (time, _ord) - what PostgreSQL's insertion order gave for free.
 */
let lastOrd = 0;
export function monotonic(): number {
  lastOrd = Math.max(lastOrd + 1, Date.now() * 1000);
  return lastOrd;
}

/** Plain code-point string order: what PostgreSQL's default (C) collation does, unlike locale-aware localeCompare. */
export const compareCodePoints = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Firestore document ids may not contain "/" and cannot be "." or ".."; encode natural keys (emails, phones, dedupe keys) safely. */
export function safeId(key: string): string {
  return encodeURIComponent(key).replace(/\./g, "%2E");
}
