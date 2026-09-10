import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database test of getUserActivityTimeline() — the founder-only
 * individual user admin page's activity feed (Part 25). Scoped to a
 * uniquely-generated userId per test, so unlike the session-aggregate
 * tests in this directory this never needs to truncate the shared
 * analytics_events table — the userId filter alone gives a clean slate.
 */
test(
  "getUserActivityTimeline: returns this user's own events, newest first, with human-readable detail",
  { skip: !hasTestDatabase },
  async () => {
    const { postgresAnalyticsSink } = await import(
      "../../developer-connect/db/postgres-analytics-sink.ts"
    );
    const { getUserActivityTimeline } = await import("../queries.ts");

    const userId = `test-user-${randomUUID()}`;
    const otherUserId = `test-user-${randomUUID()}`;
    const now = new Date();

    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: new Date(now.getTime() - 2000),
      sessionId: randomUUID(),
      userId,
      query: "test query",
      resultCount: 1,
    });
    await postgresAnalyticsSink.record({
      eventName: "profile_started",
      occurredAt: new Date(now.getTime() - 1000),
      sessionId: randomUUID(),
      userId,
    });
    // Belongs to a different user — must never show up in userId's timeline.
    await postgresAnalyticsSink.record({
      eventName: "profile_started",
      occurredAt: now,
      sessionId: randomUUID(),
      userId: otherUserId,
    });

    const timeline = await getUserActivityTimeline(userId);

    assert.equal(timeline.length, 2);
    // Newest first.
    assert.equal(timeline[0].eventName, "profile_started");
    assert.equal(timeline[1].eventName, "search_performed");
    assert.equal(timeline[1].detail, 'Searched "test query"');
    assert.ok(timeline.every((e) => e.eventName !== undefined));
  },
);

test(
  "getUserActivityTimeline: a user with no events returns an empty list, not an error",
  { skip: !hasTestDatabase },
  async () => {
    const { getUserActivityTimeline } = await import("../queries.ts");
    const timeline = await getUserActivityTimeline(`test-user-${randomUUID()}`);
    assert.deepEqual(timeline, []);
  },
);
