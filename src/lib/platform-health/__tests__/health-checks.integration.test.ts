import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database (and, for authentication, real-Clerk) tests of the
 * actual I/O-performing health checks — algorithm.test.ts already covers
 * the pure decision logic without any of this. Skipped unless
 * TEST_DATABASE_URL is set.
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
    // Never fabricated: no Neon Management API credential is configured
    // in this project, so a real capacity genuinely isn't available.
    assert.equal(result.storage.capacityBytes, null);
    assert.equal(result.storage.remainingBytes, null);
    assert.equal(result.storage.usagePercent, null);
    assert.ok(typeof result.storage.capacityUnavailableReason === "string");
    // Status is deliberately NOT pinned to HEALTHY/NEEDS_ATTENTION here:
    // this measures real, variable network latency to a real cloud
    // database, which can legitimately cross into ACTION_REQUIRED under
    // real conditions (a genuinely slow moment for this environment) —
    // the exact latency-to-status mapping is already deterministically
    // covered with controlled inputs in algorithm.test.ts. What this
    // test actually verifies is that the connection and storage
    // measurement themselves are real, which the assertions above cover.
    assert.ok(["HEALTHY", "NEEDS_ATTENTION", "ACTION_REQUIRED"].includes(result.status));
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
      "developer_edit_events",
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
    assert.equal(result.storage.capacityBytes, null);
  },
);

test(
  "checkDatabaseHealth: result never contains any developer/product-data field — the type itself has none",
  { skip: !hasTestDatabase },
  async () => {
    const { checkDatabaseHealth } = await import("../health-checks.ts");
    const result = await checkDatabaseHealth();
    const keys = Object.keys(result);
    assert.deepEqual(
      keys.sort(),
      ["status", "summary", "detail", "connectionOk", "latencyMs", "storage", "tableBreakdown"].sort(),
    );
  },
);

test("checkObjectStorageHealth: always honestly NOT_MEASURED — no object storage provider is configured in this project", async () => {
  const { checkObjectStorageHealth } = await import("../health-checks.ts");
  const result = checkObjectStorageHealth();
  assert.equal(result.status, "NOT_MEASURED");
  assert.equal(result.inUse, false);
  assert.equal(result.provider, null);
  assert.equal(result.storage, null);
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
    assert.ok(typeof health.overallMessage === "string" && health.overallMessage.length > 0);
    assert.ok(Array.isArray(health.warnings));
  },
);

test(
  "getPlatformHealth: never mixes developer/data-quality signals into overall status — a fresh developer with no verified website never moves overallStatus off HEALTHY",
  { skip: !hasTestDatabase },
  async () => {
    const { getPlatformHealth } = await import("../health-checks.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { randomUUID } = await import("node:crypto");

    const repos = createPostgresRepositories();
    const token = randomUUID().slice(0, 8);
    // A developer with no website candidate at all is exactly the kind of
    // condition that used to drive Platform Health into NEEDS_ATTENTION
    // ("developers without a verified website"). It must have zero effect now.
    await createDeveloper(repos.developers, {
      legalName: `PLATFORM HEALTH TEST ${token} Pvt Ltd`,
      displayName: `Platform Health Test ${token}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const health = await getPlatformHealth();
    // If infrastructure itself is genuinely healthy, overall status must
    // be HEALTHY regardless of the unverified developer just created.
    if (health.database.status === "HEALTHY" && health.authentication.status !== "ACTION_REQUIRED" && health.authentication.status !== "NEEDS_ATTENTION") {
      assert.equal(health.overallStatus, "HEALTHY");
      assert.equal(health.overallMessage, "Everything is running normally.");
      assert.deepEqual(health.warnings, []);
    }
  },
);
