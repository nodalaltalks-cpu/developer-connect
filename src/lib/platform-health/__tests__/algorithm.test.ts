import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOverallStatus, computeOverallMessage, buildWarnings } from "../algorithm.ts";
import type { DatabaseHealth, AuthenticationHealth, DeploymentHealth, CapacityInfo } from "../types.ts";

function storage(overrides: Partial<CapacityInfo> = {}): CapacityInfo {
  return {
    measured: false,
    usedBytes: null,
    capacityBytes: null,
    remainingBytes: null,
    usagePercent: null,
    reason: "test",
    ...overrides,
  };
}
function db(overrides: Partial<DatabaseHealth> = {}): DatabaseHealth {
  return {
    status: "HEALTHY",
    summary: "",
    detail: "",
    connectionOk: true,
    latencyMs: 10,
    storage: storage(),
    tableBreakdown: [],
    ...overrides,
  };
}
function auth(overrides: Partial<AuthenticationHealth> = {}): AuthenticationHealth {
  return { status: "HEALTHY", summary: "", detail: "", clerkReachable: true, latencyMs: 10, ...overrides };
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
  const warnings = buildWarnings({ database: db(), authentication: auth(), deployment: deployment() });
  assert.deepEqual(warnings, []);
});

test("buildWarnings: database connection failure produces exactly one ACTION_REQUIRED warning", () => {
  const warnings = buildWarnings({
    database: db({ status: "ACTION_REQUIRED", connectionOk: false }),
    authentication: auth(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-connection-failed");
  assert.equal(warnings[0].level, "ACTION_REQUIRED");
});

test("buildWarnings: multiple simultaneous problems each produce their own warning", () => {
  const warnings = buildWarnings({
    database: db({ status: "NEEDS_ATTENTION", latencyMs: 350, summary: "Database is responding slowly" }),
    authentication: auth({ status: "ACTION_REQUIRED", clerkReachable: false }),
    deployment: deployment(),
  });
  const ids = warnings.map((w) => w.id).sort();
  assert.deepEqual(ids, ["authentication-unreachable", "database-response-slow"]);
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
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-response-slow");
  assert.equal(warnings[0].title, "Database is responding slowly");
});

test("buildWarnings: a database NEEDS_ATTENTION caused by storage approaching a real capacity is never mislabeled as slow", () => {
  const warnings = buildWarnings({
    database: db({
      status: "NEEDS_ATTENTION",
      latencyMs: 3, // fast — well under DEGRADED_ABOVE (200)
      summary: "Database storage is getting full",
      detail: "Database storage is at 82% of its capacity.",
      storage: storage({ measured: true, usedBytes: 8200, capacityBytes: 10000, remainingBytes: 1800, usagePercent: 82 }),
    }),
    authentication: auth(),
    deployment: deployment(),
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "database-storage-high");
  assert.notEqual(warnings[0].title, "Database responding slowly");
  assert.ok(!warnings[0].explanation.toLowerCase().includes("slow"));
});

test("computeOverallMessage: HEALTHY with no warnings uses the canonical 'everything normal' sentence", () => {
  assert.equal(computeOverallMessage("HEALTHY", []), "Everything is running normally.");
});

test("computeOverallMessage: NEEDS_ATTENTION uses the most severe warning's own explanation, not a generic phrase", () => {
  const warnings = buildWarnings({
    database: db({ status: "NEEDS_ATTENTION", latencyMs: 350, summary: "x", detail: "Some database requests are taking longer than usual." }),
    authentication: auth(),
    deployment: deployment(),
  });
  assert.equal(computeOverallMessage("NEEDS_ATTENTION", warnings), "Some database requests are taking longer than usual.");
});

test("computeOverallMessage: ACTION_REQUIRED prefers an ACTION_REQUIRED warning over a simultaneous NEEDS_ATTENTION one", () => {
  const warnings = buildWarnings({
    database: db({ status: "NEEDS_ATTENTION", latencyMs: 350, summary: "x", detail: "db slow detail" }),
    authentication: auth({ status: "ACTION_REQUIRED", clerkReachable: false }),
    deployment: deployment(),
  });
  assert.equal(
    computeOverallMessage("ACTION_REQUIRED", warnings),
    "Developer Connect could not reach its sign-in provider — visitors may be unable to sign in.",
  );
});

test("computeOverallMessage: falls back to canonical text for ACTION_REQUIRED/NOT_MEASURED with no warnings", () => {
  assert.equal(computeOverallMessage("ACTION_REQUIRED", []), "An infrastructure service is unavailable.");
  assert.equal(computeOverallMessage("NOT_MEASURED", []), "Infrastructure health could not be measured right now.");
});
