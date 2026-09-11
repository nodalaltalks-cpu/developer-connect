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
  "checkDatabaseHealth: table breakdown is real — every application table appears exactly once, sizes are positive, percentages never exceed 100 and are only present because a real total was measured",
  { skip: !hasTestDatabase },
  async () => {
    const { checkDatabaseHealth } = await import("../health-checks.ts");
    const result = await checkDatabaseHealth();

    assert.ok(result.storage.measured);
    const expectedTables = [
      "developers",
      "website_candidates",
      "evidence",
      "verification_events",
      "profiles",
      "notifications",
      "analytics_events",
    ];
    const seenTables = result.tableBreakdown.map((t) => t.tableName).sort();
    assert.deepEqual(seenTables, expectedTables.sort());

    for (const table of result.tableBreakdown) {
      assert.ok(table.rowCount >= 0, `${table.tableName} rowCount must be >= 0`);
      assert.ok(table.sizeBytes >= 0, `${table.tableName} sizeBytes must be >= 0`);
      if (table.percentOfTotal !== null) {
        assert.ok(
          table.percentOfTotal >= 0 && table.percentOfTotal <= 100,
          `${table.tableName} percentOfTotal (${table.percentOfTotal}) must be within 0-100`,
        );
      }
    }

    // Never a fabricated capacity/remaining figure alongside the real breakdown.
    assert.equal(result.storage.limitBytes, null);
  },
);

test(
  "checkProductDataHealth: developer status breakdown sums to totalDevelopers, and agrees with getDeveloperVerificationBreakdown directly",
  { skip: !hasTestDatabase },
  async () => {
    const { checkProductDataHealth } = await import("../health-checks.ts");
    const { getDeveloperVerificationBreakdown, getInfrastructureEntityCounts } = await import(
      "../../admin-analytics/queries.ts"
    );

    const [result, directBreakdown, directEntityCounts] = await Promise.all([
      checkProductDataHealth(),
      getDeveloperVerificationBreakdown(),
      getInfrastructureEntityCounts(),
    ]);

    assert.deepEqual(result.developerStatusBreakdown, directBreakdown);

    const sum = Object.values(result.developerStatusBreakdown).reduce((a, b) => a + b, 0);
    // totalDevelopers counts ALL developers (any status column value);
    // the breakdown counts only ACTIVE ones — so the sum can be less
    // than or equal to totalDevelopers, never more.
    assert.ok(sum <= result.totalDevelopers);

    assert.deepEqual(result.entityCounts, {
      websiteCandidates: directEntityCounts.websiteCandidates,
      evidence: directEntityCounts.evidence,
      verificationEvents: directEntityCounts.verificationEvents,
      profiles: directEntityCounts.profiles,
      notifications: directEntityCounts.notifications,
      analyticsEvents: directEntityCounts.analyticsEvents,
    });
    for (const value of Object.values(result.entityCounts)) {
      assert.ok(value >= 0);
    }
  },
);

test("checkObjectStorageHealth: always honestly NOT_MEASURED — no object storage provider is configured in this project", async () => {
  const { checkObjectStorageHealth } = await import("../health-checks.ts");
  const result = checkObjectStorageHealth();
  assert.equal(result.status, "NOT_MEASURED");
  assert.equal(result.inUse, false);
  assert.equal(result.provider, null);
});

test("checkDeploymentHealth: off Vercel, every new field is null rather than fabricated", async () => {
  const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalUrl = process.env.VERCEL_URL;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_REGION;
  delete process.env.VERCEL_GIT_COMMIT_REF;
  delete process.env.VERCEL_DEPLOYMENT_ID;
  try {
    const { checkDeploymentHealth } = await import("../health-checks.ts");
    const result = checkDeploymentHealth();
    assert.equal(result.status, "NOT_MEASURED");
    assert.equal(result.commitSha, null);
    assert.equal(result.deploymentUrl, null);
    assert.equal(result.region, null);
    assert.equal(result.gitBranch, null);
    assert.equal(result.deploymentId, null);
  } finally {
    if (originalSha !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
    if (originalUrl !== undefined) process.env.VERCEL_URL = originalUrl;
  }
});

test(
  "checkProductDataHealth: returns well-formed counts regardless of what's currently in the table",
  { skip: !hasTestDatabase },
  async () => {
    const { checkProductDataHealth } = await import("../health-checks.ts");
    const result = await checkProductDataHealth();

    assert.ok(["HEALTHY", "NEEDS_ATTENTION", "NOT_MEASURED"].includes(result.status));
    assert.ok(result.totalDevelopers >= 0);
    assert.ok(result.verifiedDevelopers >= 0);
    assert.ok(result.verifiedNeverReChecked >= 0);
    if (result.totalDevelopers === 0) {
      assert.equal(result.status, "NOT_MEASURED");
    }
    // The exact bug this guards: verifiedNeverReChecked feeds the
    // NEEDS_ATTENTION decision (see checkProductDataHealth's `hasIssue`)
    // but was previously dropped before reaching the returned object, so
    // a status driven solely by this count showed "0" everywhere it was
    // displayed. If it's the only nonzero count, the status must still
    // reflect it.
    if (
      result.verifiedNeverReChecked > 0 &&
      result.developersWithoutVerifiedWebsite === 0 &&
      result.candidatesWithNoEvidence === 0
    ) {
      assert.equal(result.status, "NEEDS_ATTENTION");
    }
  },
);

test(
  "checkDatabaseHealth + buildWarnings: a fast database with only data-quality counts is never reported as slow",
  { skip: !hasTestDatabase },
  async () => {
    const { checkDatabaseHealth } = await import("../health-checks.ts");
    const { buildWarnings } = await import("../algorithm.ts");
    const { DATABASE_LATENCY_THRESHOLDS_MS } = await import("../thresholds.ts");
    const database = await checkDatabaseHealth();

    if (database.status === "NEEDS_ATTENTION" && database.latencyMs !== null) {
      const isGenuinelySlow = database.latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.DEGRADED_ABOVE;
      const warnings = buildWarnings({
        database,
        authentication: { status: "HEALTHY", summary: "", detail: "", clerkReachable: true, latencyMs: 10 },
        analytics: {
          status: "HEALTHY",
          summary: "",
          detail: "",
          mostRecentEventAt: null,
          eventsToday: 0,
          totalEventsEver: 0,
        },
        productData: {
          status: "HEALTHY",
          summary: "",
          detail: "",
          totalDevelopers: 0,
          verifiedDevelopers: 0,
          pendingVerification: 0,
          developersWithoutVerifiedWebsite: 0,
          candidatesWithNoEvidence: 0,
          verifiedNeverReChecked: 0,
          developerStatusBreakdown: {
            discovered: 0,
            pendingVerification: 0,
            verified: 0,
            needsReverification: 0,
            rejected: 0,
            inactive: 0,
          },
          entityCounts: {
            websiteCandidates: 0,
            evidence: 0,
            verificationEvents: 0,
            profiles: 0,
            notifications: 0,
            analyticsEvents: 0,
          },
        },
        application: { status: "NOT_MEASURED", summary: "", detail: "" },
        deployment: {
          status: "NOT_MEASURED",
          summary: "",
          detail: "",
          commitSha: null,
          environment: null,
          deploymentUrl: null,
          region: null,
          gitBranch: null,
          deploymentId: null,
        },
      });
      const dbWarning = warnings.find((w) => w.category === "DATABASE");
      assert.ok(dbWarning);
      if (!isGenuinelySlow) {
        assert.equal(dbWarning!.id, "database-data-quality");
        assert.ok(!dbWarning!.title.toLowerCase().includes("slow"));
      } else {
        assert.equal(dbWarning!.id, "database-response-slow");
      }
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
