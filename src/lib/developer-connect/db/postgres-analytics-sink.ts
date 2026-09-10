import { randomUUID } from "node:crypto";
import { getDb } from "./client.ts";
import { analyticsEvents } from "./schema.ts";
import type { AnalyticsEvent, AnalyticsEventSink } from "../events.ts";

/**
 * Real, persisted analytics — not a dashboard, just structured storage so
 * the events Phase 2A's event taxonomy defines are actually captured
 * instead of discarded. `eventName`, `occurredAt`, `sessionId`, `userId`,
 * and `developerId` (each when present) get their own indexed columns;
 * everything else event-specific lands in `payload`.
 */
export const postgresAnalyticsSink: AnalyticsEventSink = {
  async record(event: AnalyticsEvent) {
    const { eventName, occurredAt, sessionId, anonymousUserId, userId, ...rest } = event;
    const { developerId, ...payload } = rest as typeof rest & { developerId?: string };

    await getDb()
      .insert(analyticsEvents)
      .values({
        id: randomUUID(),
        eventName,
        occurredAt,
        sessionId,
        anonymousUserId,
        userId,
        developerId,
        payload,
      });
  },
};
