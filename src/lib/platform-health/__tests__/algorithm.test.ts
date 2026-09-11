import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOverallStatus, buildWarnings } from "../algorithm.ts";
import type {
  DatabaseHealth,
  ApplicationHealth,
  AuthenticationHealth,
  ProductDataHealth,
  AnalyticsHealth,
  DeploymentHealth,
} from "../types.ts";

function db(overrides: Partial<DatabaseHealth> = {}): DatabaseHealth {
  return {
    status: "HEALTHY",
    summary: "",
    detail: "",
    connectionOk: true,
    latencyMs: 10,
    storage: { measured: false, usedBytes: null, limitBytes: null, reason: "test" },
    tableBreakdown: [],
    dataQuality: { developersWithoutVerifiedWebsite: 0, candidatesWithNoEvidence: 0, verifiedNeverReChecked: 0 },
    ...overrides,
  };
}
function auth(overrides: Partial<AuthenticationHealth> = {}): AuthenticationHealth {
  return { status: "HEALTHY", summary: "", detail: "", clerkReachable: true, latencyMs: 10, ...overrides };
}
function analytics(overrides: Partial<AnalyticsHealth> = {}): AnalyticsHealth {
  return {
    status: "HEALTHY",
    summary: "",
    detail: "",
    mostRecentEventAt: new Date(),
    eventsToday: 1,
    totalEventsEver: 1,
    ...overrides,
  };
}
function productData(overrides: Partial<ProductDataHealth> = {}): ProductDataHealth {
  return {
    status: "HEALTHY",
    summary: "",
    detail: "",
    totalDevelopers: 1,
    verifiedDevelopers: 1,
    pendingVerification: 0,
    developersWithoutVerifiedWebsite: 0,
    candidatesWithNoEvidence: 0,
    verifiedNeverReChecked: 0,
    developerStatusBreakdown: {
      discovered: 0,
      pendingVerification: 0,
      verified: 1,
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
    ...overrides,
  };
}
function application(overrides: Partial<ApplicationHealth> = {}): ApplicationHealth {
  return { status: "NOT_MEASURED", summary: "", detail: "", ...overrides };
}
function deployment(overrides: Partial<DeploymentHealth> = {}): DeploymentHealth {
  return {
    status: "NOT_MEASURED",
    summary: "",
    detail: "",
    commitSha: null,
    environment: null,
    deploymentUrl: null,
    region: null,
    gitBranch: null,
    deploymentId: null,
    ...overrides,
  };
}

test("computeOverallStatus: all healthy (NOT_MEASURED categories ignored) is HEALTHY", () => {
  assert.equal(
    computeOverallStatus(["HEALTHY", "HEALTHY", "NOT_MEASURED", "NOT_MEASURED"]),
    "HEALTHY",
  );
});

test("computeOverallStatus: any ACTION_REQUIRED wins regardless of other statuses", () => {
  assert.equal(
    computeOverallStatus(["HEALTHY", "NEEDS_ATTENTION", "ACTION_REQUIRED", "NOT_MEASURED"]),
    "ACTION_REQUIRED",
  );
});

test("computeOverallStatus: NEEDS_ATTENTION wins over HEALTHY when no ACTION_REQUIRED exists", () => {
  assert.equal(computeOverallStatus(["HEALTHY", "NEEDS_ATTENTION", "NOT_MEASURED"]), "NEEDS_ATTENTION");
});

test("computeOverallStatus: everything NOT_MEASURED means NOT_MEASURED overall, not HEALTHY", () => {
  assert.equal(computeOverallStatus(["NOT_MEASURED", "NOT_MEASURED"]), "NOT_MEASURED");
});

test("buildWarnings: a healthy platform produces no warnings", () => {
  const warnings = buildWarnings({
    database: db(),
    authentication: auth(),
    analytics: analytics(),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.deepEqual(warnings, []);
});

test("buildWarnings: database connection failure produces exactly one ACTION_REQUIRED warning", () => {
  const warnings = buildWarnings({
    database: db({ status: "ACTION_REQUIRED", connectionOk: false }),
    authentication: auth(),
    analytics: analytics(),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-connection-failed");
  assert.equal(warnings[0].level, "ACTION_REQUIRED");
});

test("buildWarnings: analytics staleness only warns when there IS history — never for 'no usage yet'", () => {
  const noHistory = buildWarnings({
    database: db(),
    authentication: auth(),
    analytics: analytics({ status: "NOT_MEASURED", totalEventsEver: 0, eventsToday: 0, mostRecentEventAt: null }),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.deepEqual(noHistory, []); // NOT_MEASURED never generates a warning

  const staleWithHistory = buildWarnings({
    database: db(),
    authentication: auth(),
    analytics: analytics({ status: "NEEDS_ATTENTION", totalEventsEver: 50, eventsToday: 0 }),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(staleWithHistory.length, 1);
  assert.equal(staleWithHistory[0].id, "analytics-stopped");
});

test("buildWarnings: multiple simultaneous problems each produce their own warning", () => {
  const warnings = buildWarnings({
    database: db({ status: "NEEDS_ATTENTION", latencyMs: 350, summary: "Database is responding slowly" }),
    authentication: auth({ status: "ACTION_REQUIRED", clerkReachable: false }),
    analytics: analytics(),
    productData: productData({ status: "NEEDS_ATTENTION", developersWithoutVerifiedWebsite: 2 }),
    application: application(),
    deployment: deployment(),
  });
  const ids = warnings.map((w) => w.id).sort();
  assert.deepEqual(ids, ["authentication-unreachable", "database-response-slow", "product-data-quality"]);
});

test("buildWarnings: a database NEEDS_ATTENTION caused by genuinely slow latency is labeled as slow", () => {
  const warnings = buildWarnings({
    database: db({
      status: "NEEDS_ATTENTION",
      latencyMs: 350, // above DEGRADED_ABOVE (200)
      summary: "Database is responding slowly",
      detail: "Some database requests are taking longer than usual.",
    }),
    authentication: auth(),
    analytics: analytics(),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-response-slow");
  assert.equal(warnings[0].title, "Database is responding slowly");
});

test("buildWarnings: a database NEEDS_ATTENTION caused by data-quality counts (fast latency) is never mislabeled as slow — reproduces and fixes the reported inconsistency", () => {
  const warnings = buildWarnings({
    database: db({
      status: "NEEDS_ATTENTION",
      latencyMs: 3, // fast — well under DEGRADED_ABOVE (200)
      summary: "Database is working normally, with some data to review",
      detail: "The connection and speed are fine — a few developer records need attention (see below).",
      dataQuality: { developersWithoutVerifiedWebsite: 0, candidatesWithNoEvidence: 0, verifiedNeverReChecked: 10 },
    }),
    authentication: auth(),
    analytics: analytics(),
    productData: productData(),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-data-quality");
  assert.notEqual(warnings[0].title, "Database responding slowly");
  assert.equal(warnings[0].title, "Database is working normally, with some data to review");
  assert.ok(!warnings[0].explanation.toLowerCase().includes("slow"));
});

test("buildWarnings: product-data warning names the real counts causing it, including verifiedNeverReChecked", () => {
  const warnings = buildWarnings({
    database: db(),
    authentication: auth(),
    analytics: analytics(),
    productData: productData({ status: "NEEDS_ATTENTION", verifiedNeverReChecked: 10 }),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "product-data-quality");
  assert.ok(warnings[0].explanation.includes("10 verified websites never re-checked since approval"));
  // Only cause present is the "not automated yet" one — recommendation must not imply an urgent backlog.
  assert.ok(warnings[0].recommendedAction.includes("No urgent action needed"));
});

test("buildWarnings: product-data warning treats a real missing-website backlog as actionable, distinct from the re-check-only case", () => {
  const warnings = buildWarnings({
    database: db(),
    authentication: auth(),
    analytics: analytics(),
    productData: productData({
      status: "NEEDS_ATTENTION",
      developersWithoutVerifiedWebsite: 2,
      verifiedNeverReChecked: 10,
    }),
    application: application(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].explanation.includes("2 active developers without a verified website"));
  assert.equal(warnings[0].recommendedAction, "Review Data Quality for the specific records that need attention.");
});
