import { randomUUID } from "node:crypto";
import { getFirestoreDb } from "./client.ts";
import { reqDate, toTs } from "./convert.ts";
import type { AnalyticsEvent } from "../developer-connect/events.ts";

/**
 * The raw analytics event log in Firestore (collection `analyticsEvents`), plus the one reader every dashboard shares.
 *
 * Firestore cannot GROUP BY, so reports that were SQL aggregates read the events of their date range through
 * `readEvents` (only the fields they ask for, in pages) and aggregate in application code. They are founder-only
 * pages opened occasionally; the public site never reads this collection.
 */

export interface StoredEvent {
  id: string;
  eventName: string;
  occurredAt: Date;
  sessionId: string;
  anonymousUserId: string | null;
  userId: string | null;
  developerId: string | null;
  payload: Record<string, unknown>;
}

export async function recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const { eventName, occurredAt, sessionId, anonymousUserId, userId, ...rest } = event;
  const { developerId, ...payload } = rest as typeof rest & { developerId?: string };
  await getFirestoreDb()
    .collection("analyticsEvents")
    .doc(randomUUID())
    .create({
      eventName,
      occurredAt: toTs(occurredAt),
      sessionId,
      anonymousUserId: anonymousUserId ?? null,
      userId: userId ?? null,
      developerId: developerId ?? null,
      payload,
    });
}

export interface EventFilter {
  from?: Date;
  to?: Date;
  /** One name uses an equality filter; several use `in` (at most 30). */
  names?: string[];
  sessionId?: string;
  userId?: string;
  developerId?: string;
  /** Newest first when true; oldest first otherwise (the default). */
  newestFirst?: boolean;
  /** A hard cap on rows returned. */
  limit?: number;
  /** Only fetch these fields (the id and timestamp always come back); the rest read as null/empty. */
  fields?: string[];
}

const PAGE = 5000;

function toStored(id: string, d: FirebaseFirestore.DocumentData): StoredEvent {
  return {
    id,
    eventName: d.eventName ?? "",
    occurredAt: reqDate(d.occurredAt),
    sessionId: d.sessionId ?? "",
    anonymousUserId: d.anonymousUserId ?? null,
    userId: d.userId ?? null,
    developerId: d.developerId ?? null,
    payload: (d.payload ?? {}) as Record<string, unknown>,
  };
}

/** Reads matching events in pages of 5,000 so a wide date range never needs one enormous response. */
export async function readEvents(filter: EventFilter = {}): Promise<StoredEvent[]> {
  let q: FirebaseFirestore.Query = getFirestoreDb().collection("analyticsEvents");
  if (filter.names?.length === 1) q = q.where("eventName", "==", filter.names[0]);
  else if (filter.names && filter.names.length > 1) q = q.where("eventName", "in", filter.names);
  if (filter.sessionId) q = q.where("sessionId", "==", filter.sessionId);
  if (filter.userId) q = q.where("userId", "==", filter.userId);
  if (filter.developerId) q = q.where("developerId", "==", filter.developerId);
  if (filter.from) q = q.where("occurredAt", ">=", toTs(filter.from));
  if (filter.to) q = q.where("occurredAt", "<", toTs(filter.to));
  q = q.orderBy("occurredAt", filter.newestFirst ? "desc" : "asc");
  if (filter.fields) q = q.select("occurredAt", ...filter.fields);

  const out: StoredEvent[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const want = filter.limit === undefined ? PAGE : Math.min(PAGE, filter.limit - out.length);
    if (want <= 0) break;
    let page = q.limit(want);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    for (const d of snap.docs) out.push(toStored(d.id, d.data()));
    if (snap.size < want) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** A count that does not download the documents. */
export async function countEvents(filter: Omit<EventFilter, "limit" | "newestFirst"> = {}): Promise<number> {
  let q: FirebaseFirestore.Query = getFirestoreDb().collection("analyticsEvents");
  if (filter.names?.length === 1) q = q.where("eventName", "==", filter.names[0]);
  else if (filter.names && filter.names.length > 1) q = q.where("eventName", "in", filter.names);
  if (filter.sessionId) q = q.where("sessionId", "==", filter.sessionId);
  if (filter.userId) q = q.where("userId", "==", filter.userId);
  if (filter.developerId) q = q.where("developerId", "==", filter.developerId);
  if (filter.from) q = q.where("occurredAt", ">=", toTs(filter.from));
  if (filter.to) q = q.where("occurredAt", "<", toTs(filter.to));
  return (await q.count().get()).data().count;
}
