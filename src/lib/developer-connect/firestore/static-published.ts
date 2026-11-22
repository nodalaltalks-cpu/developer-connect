import { Timestamp } from "firebase-admin/firestore";
import type { SnapshotRow } from "./public-snapshot.ts";

/**
 * The published developer directory saved as a file inside the project (src/data/published-snapshot.json) and shipped with
 * every deployment.
 *
 * Why: public pages only need a read-only copy of the published developers. Reading it from Firestore cost reads on every cache
 * refresh, and the free plan stops at 50,000 reads a day, after which public pages failed. A file costs no reads at all, so
 * visitors and crawlers can never use up the quota, and the public site keeps working even when Firestore is over its limit.
 *
 * The file is a copy, never the source of truth: Firestore still is. `npm run snapshot:pull` rewrites it from Firestore, and the
 * next deployment ships it. Set PUBLIC_DATA_SOURCE=firestore to ignore the file and read Firestore as before.
 */

export interface StaticSnapshotFile {
  builtAt: string | null;
  count: number;
  rows: SnapshotRow[];
}

const TS = "$ts";

/** Firestore Timestamps and Dates become `{ "$ts": ISO }` so the rows survive JSON. */
export function encodeRows(value: unknown): unknown {
  if (value instanceof Timestamp) return { [TS]: value.toDate().toISOString() };
  if (value instanceof Date) return { [TS]: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeRows);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encodeRows(v);
    return out;
  }
  return value;
}

/** The reverse of encodeRows: `{ "$ts": ISO }` becomes a Timestamp again, which is what the repository code expects. */
export function decodeRows(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeRows);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === TS && typeof obj[TS] === "string") return Timestamp.fromDate(new Date(obj[TS] as string));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeRows(v);
    return out;
  }
  return value;
}

let decoded: SnapshotRow[] | null | undefined;

/** The rows in the shipped file, or null when the file is empty or the switch says to use Firestore. Decoded once per process. */
export async function staticPublishedRows(): Promise<SnapshotRow[] | null> {
  if (process.env.PUBLIC_DATA_SOURCE === "firestore") return null;
  if (decoded !== undefined) return decoded;
  const file = (await import("../../../data/published-snapshot.json")).default as unknown as StaticSnapshotFile;
  decoded = Array.isArray(file.rows) && file.rows.length > 0 ? (decodeRows(file.rows) as SnapshotRow[]) : null;
  return decoded;
}
