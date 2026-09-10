import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database (and, for authentication, real-Clerk) tests of the
 * actual I/O-performing health checks — algorithm.test.ts already covers
 * the pure decision logic without any of this. Skipped unless
 * TEST_DATABASE_URL is set.
 *
 * The analytics sub-test clears analytics_events for exact-count
 * assertions — safe only because the test suite is pinned to
 * --test-concurrency=1 (see package.json and the other tests that rely
 * on the same table-clearing pattern).
 */
test(
  "checkDatabaseHealth: reports a real, timed connection and a real storage byte count",
  { skip: !hasTestDatabase },
  async () => {
    const { checkDatabaseHealth } = await import("../health-checks.ts");
    const result = await checkDatabaseHealth();

    assert.equal(result.connectionOk, true);
    assert.ok(typeof result.latencyMs === "number" && result.latencyMs! >= 0);
    assert.equal(result.storage.measured, true);
    assert.ok(typeof result.storage.usedBytes === "number" && result.storage.usedBytes! > 0);
    assert.equal(result.storage.limitBytes, null); // never fabricated
    assert.ok(["HEALTHY", "NEEDS_ATTENTION"].includes(result.status));
  },
);

test(
  "checkProductDataHealth: returns well-formed counts regardless of what's currently in the table",
  { skip: !hasTestDatabase },
  async () => {
    const { checkProductDataHealth } = await import("../health-checks.ts");
    const result = await checkProductDataHealth();

    assert.ok(["HEALTHY", "NEEDS_ATTENTION", "NOT_MEASURED"].includes(result.status));
    assert.ok(result.totalDevelopers >= 0);
    assert.ok(result.verifiedDevelopers >= 0);
    if (result.totalDevelopers === 0) {
      assert.equal(result.status, "NOT_MEASURED");
    }
  },
);

test(
  "checkAnalyticsHealth: empty table is NOT_MEASURED (no usage yet), never a failure",
  { skip: !hasTestDatabase },
  async () => {
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { analyticsEvents } = await import("../../developer-connect/db/schema.ts");
    await getDb().delete(analyticsEvents);

    const { checkAnalyticsHealth } = await import("../health-checks.ts");
    const result = await checkAnalyticsHealth();

    assert.equal(result.status, "NOT_MEASURED");
    assert.equal(result.totalEventsEver, 0);
    assert.equal(result.mostRecentEventAt, null);
  },
);

test(
  "checkAnalyticsHealth: a recent event is HEALTHY; only an old event (with history) is NEEDS_ATTENTION",
  { skip: !hasTestDatabase },
  async () => {
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { analyticsEvents } = await import("../../developer-connect/db/schema.ts");
    const { postgresAnalyticsSink } = await import("../../developer-connect/db/postgres-analytics-sink.ts");
    const { randomUUID } = await import("node:crypto");
    await getDb().delete(analyticsEvents);

    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: new Date(),
      sessionId: randomUUID(),
      deviceType: "desktop",
      query: "recent",
      resultCount: 1,
    });

    const { checkAnalyticsHealth } = await import("../health-checks.ts");
    const recent = await checkAnalyticsHealth();
    assert.equal(recent.status, "HEALTHY");
    assert.equal(recent.totalEventsEver, 1);

    await getDb().delete(analyticsEvents);
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: thirtyHoursAgo,
      sessionId: randomUUID(),
      deviceType: "desktop",
      query: "stale",
      resultCount: 1,
    });

    const stale = await checkAnalyticsHealth();
    assert.equal(stale.status, "NEEDS_ATTENTION");
    assert.equal(stale.totalEventsEver, 1);
  },
);

test(
  "checkAuthenticationHealth: reaches the real Clerk Backend API and never exposes the secret key",
  { skip: !hasTestDatabase || !process.env.CLERK_SECRET_KEY },
  async () => {
    const { checkAuthenticationHealth } = await import("../health-checks.ts");
    const result = await checkAuthenticationHealth();

    assert.ok(["HEALTHY", "NEEDS_ATTENTION", "ACTION_REQUIRED"].includes(result.status));
    assert.ok(typeof result.latencyMs === "number");
    assert.ok(!JSON.stringify(result).includes(process.env.CLERK_SECRET_KEY!));
  },
);

test(
  "getPlatformHealth: the full result never contains CLERK_SECRET_KEY or DATABASE_URL, and applies the documented overall-status algorithm",
  { skip: !hasTestDatabase },
  async () => {
    const { getPlatformHealth } = await import("../health-checks.ts");
    const health = await getPlatformHealth();
    const serialized = JSON.stringify(health);

    if (process.env.CLERK_SECRET_KEY) {
      assert.ok(!serialized.includes(process.env.CLERK_SECRET_KEY));
    }
    assert.ok(!serialized.includes(process.env.DATABASE_URL!));

    assert.ok(["HEALTHY", "NEEDS_ATTENTION", "ACTION_REQUIRED", "NOT_MEASURED"].includes(health.overallStatus));
    assert.ok(Array.isArray(health.warnings));
  },
);
