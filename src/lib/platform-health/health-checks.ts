import { sql } from "drizzle-orm";
import { getDb } from "../developer-connect/db/client.ts";
import { getInfrastructureEntityCounts, getDatabaseTableSizes } from "../admin-analytics/queries.ts";
import {
  DATABASE_LATENCY_THRESHOLDS_MS,
  AUTHENTICATION_LATENCY_THRESHOLDS_MS,
  DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT,
  HEALTH_CHECK_TIMEOUT_MS,
} from "./thresholds.ts";
import { computeOverallStatus, computeOverallMessage, buildWarnings } from "./algorithm.ts";
import type {
  DatabaseHealth,
  DatabaseTableBreakdown,
  CapacityInfo,
  AuthenticationHealth,
  DeploymentHealth,
  ObjectStorageHealth,
  PlatformHealth,
} from "./types.ts";

/**
 * Real Neon database storage CAPACITY (as opposed to usage, which
 * pg_database_size() already measures directly). A capacity/quota is
 * genuinely not obtainable in this project today: it would require
 * Neon's separate Management API (not the Postgres connection itself,
 * which carries no quota concept), and that API requires a
 * NEON_API_KEY — confirmed absent from this project's environment (and
 * from `vercel integration balance neon`, which also reports no
 * balance/threshold data for either connected Neon resource). Rather
 * than call an unverified, untestable API path with a credential that
 * doesn't exist, this returns null honestly. If a NEON_API_KEY is ever
 * added to this project, this is the one function that should start
 * making a real call and returning a real capacity — never a hardcoded
 * or guessed one.
 */
function realDatabaseCapacityBytes(): number | null {
  return null;
}

/**
 * Database: a real timed connectivity check plus real storage usage via
 * Postgres's own pg_database_size() — never a row count pretending to be
 * storage, and never mixed with developer/data-quality signals (those
 * live in Data Quality/Verification/Developers, not here). Capacity is
 * reported only when a real provider quota is available; see
 * neonManagementApiKey() above for exactly why it currently is not.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  let connectionOk = true;
  let latencyMs: number | null = null;
  let usedBytes: number | null = null;
  let storageMeasured = false;
  let storageReason: string | undefined;
  let tableBreakdown: DatabaseTableBreakdown[] = [];

  try {
    const db = getDb();
    const start = Date.now();
    await db.execute(sql`select 1`);
    latencyMs = Date.now() - start;

    try {
      const sizeResult = await db.execute<{ size: string }>(sql`select pg_database_size(current_database()) as size`);
      const raw = sizeResult.rows[0]?.size;
      if (raw != null) {
        usedBytes = Number(raw);
        storageMeasured = true;
      } else {
        storageReason = "The database did not return a size value.";
      }
    } catch {
      storageReason = "Developer Connect could not read database storage usage.";
    }

    if (storageMeasured) {
      try {
        const [sizes, entityCounts] = await Promise.all([getDatabaseTableSizes(), getInfrastructureEntityCounts()]);
        const rowCountByTable: Record<string, number> = {
          developers: entityCounts.developers,
          website_candidates: entityCounts.websiteCandidates,
          evidence: entityCounts.evidence,
          verification_events: entityCounts.verificationEvents,
          profiles: entityCounts.profiles,
          notifications: entityCounts.notifications,
          analytics_events: entityCounts.analyticsEvents,
          developer_edit_events: entityCounts.developerEditEvents,
        };
        tableBreakdown = sizes
          .map((table) => ({
            tableName: table.tableName,
            rowCount: rowCountByTable[table.tableName] ?? 0,
            sizeBytes: table.sizeBytes,
            percentOfTotal: usedBytes! > 0 ? Math.round((table.sizeBytes / usedBytes!) * 1000) / 10 : null,
          }))
          .sort((a, b) => b.sizeBytes - a.sizeBytes);
      } catch {
        // Per-table breakdown is a bonus on top of the already-measured
        // total — its failure never demotes storageMeasured/usedBytes,
        // which are independently real.
        tableBreakdown = [];
      }
    }
  } catch {
    connectionOk = false;
    storageReason = "Storage usage cannot be checked while the database connection itself is failing.";
  }

  // Capacity: only ever populated by a real provider measurement — see
  // realDatabaseCapacityBytes() above for exactly why that's null today.
  const capacityBytes: number | null = realDatabaseCapacityBytes();
  const remainingBytes = capacityBytes !== null && usedBytes !== null ? capacityBytes - usedBytes : null;
  const usagePercent =
    capacityBytes !== null && usedBytes !== null && capacityBytes > 0
      ? Math.round((usedBytes / capacityBytes) * 1000) / 10
      : null;

  const storage: CapacityInfo = {
    measured: storageMeasured,
    usedBytes,
    capacityBytes,
    remainingBytes,
    usagePercent,
    reason: storageMeasured
      ? undefined
      : (storageReason ?? "Developer Connect cannot currently read your Neon storage usage."),
    capacityUnavailableReason: storageMeasured
      ? "Your database provider (Neon) doesn't expose a storage quota to this project — no Neon Management API credential is configured, and Postgres itself has no built-in quota concept."
      : undefined,
  };

  let status: DatabaseHealth["status"];
  let summary: string;
  let detail: string;

  if (!connectionOk) {
    status = "ACTION_REQUIRED";
    summary = "Database connection problem";
    detail = "Developer Connect is having trouble talking to its database.";
  } else if (latencyMs !== null && latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.CRITICAL_ABOVE) {
    status = "ACTION_REQUIRED";
    summary = "Database is responding very slowly";
    detail = `The last check took ${latencyMs}ms to complete, well above what's normal.`;
  } else if (latencyMs !== null && latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.DEGRADED_ABOVE) {
    status = "NEEDS_ATTENTION";
    summary = "Database is responding slowly";
    detail = "Some database requests are taking longer than usual.";
  } else if (usagePercent !== null && usagePercent >= DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT.ACTION_REQUIRED_ABOVE) {
    status = "ACTION_REQUIRED";
    summary = "Database storage is almost full";
    detail = `Database storage is at ${usagePercent}% of its capacity.`;
  } else if (usagePercent !== null && usagePercent >= DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT.NEEDS_ATTENTION_ABOVE) {
    status = "NEEDS_ATTENTION";
    summary = "Database storage is getting full";
    detail = `Database storage is at ${usagePercent}% of its capacity.`;
  } else {
    status = "HEALTHY";
    summary = "Database is working normally";
    detail = "Developer Connect can reach its database and responses are fast.";
  }

  return {
    status,
    summary,
    detail,
    connectionOk,
    latencyMs,
    storage,
    tableBreakdown,
  };
}

/**
 * Authentication: a real, timed, server-side call to Clerk's own Backend
 * API (the same mechanism already used elsewhere in this project for
 * non-destructive verification) — never exposes CLERK_SECRET_KEY to the
 * client, never reads/returns private metadata or user data, just
 * confirms the provider answers.
 */
export async function checkAuthenticationHealth(): Promise<AuthenticationHealth> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    return {
      status: "NOT_MEASURED",
      summary: "Sign-in monitoring isn't connected",
      detail: "No Clerk credentials are configured in this environment.",
      clerkReachable: null,
      latencyMs: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        status: "ACTION_REQUIRED",
        summary: "Sign-in service unreachable",
        detail: "Developer Connect could not reach its sign-in provider.",
        clerkReachable: false,
        latencyMs,
      };
    }

    if (latencyMs > AUTHENTICATION_LATENCY_THRESHOLDS_MS.CRITICAL_ABOVE) {
      return {
        status: "ACTION_REQUIRED",
        summary: "Sign-in service responding very slowly",
        detail: `The last check took ${latencyMs}ms.`,
        clerkReachable: true,
        latencyMs,
      };
    }
    if (latencyMs > AUTHENTICATION_LATENCY_THRESHOLDS_MS.DEGRADED_ABOVE) {
      return {
        status: "NEEDS_ATTENTION",
        summary: "Sign-in service responding slowly",
        detail: "Requests to the sign-in provider are taking longer than usual.",
        clerkReachable: true,
        latencyMs,
      };
    }

    return {
      status: "HEALTHY",
      summary: "Sign-in is working normally",
      detail: "Developer Connect can reach its sign-in provider and responses are fast.",
      clerkReachable: true,
      latencyMs,
    };
  } catch {
    clearTimeout(timeout);
    return {
      status: "ACTION_REQUIRED",
      summary: "Sign-in service unreachable",
      detail: "Developer Connect could not reach its sign-in provider.",
      clerkReachable: false,
      latencyMs: null,
    };
  }
}

/**
 * Deployment: only what Vercel automatically injects into every
 * function's runtime environment for free (System Environment Variables
 * — commit SHA, environment, deployment URL/id, region, git branch). No
 * Vercel API token exists in this project, so anything that would
 * require calling Vercel's REST API (build status, request/bandwidth
 * quotas, live "building/ready/error" state) is not measurable and is
 * reported as such rather than guessed or added automatically. There is
 * also no standard system env var for "when this deployment was
 * created" — that genuinely isn't available here either.
 */
export function checkDeploymentHealth(): DeploymentHealth {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const environment = process.env.VERCEL_ENV ?? null;
  const deploymentUrl = process.env.VERCEL_URL ?? null;
  const region = process.env.VERCEL_REGION ?? null;
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;

  if (!commitSha) {
    return {
      status: "NOT_MEASURED",
      summary: "Deployment monitoring isn't connected",
      detail:
        "Live deployment monitoring is not currently connected — Developer Connect can only show this when running on Vercel.",
      commitSha: null,
      environment,
      deploymentUrl,
      region,
      gitBranch,
      deploymentId,
    };
  }

  return {
    status: "HEALTHY",
    summary: "Running the expected deployment",
    detail: "This is the commit, branch, and environment currently serving Developer Connect.",
    commitSha,
    environment,
    deploymentUrl,
    region,
    gitBranch,
    deploymentId,
  };
}

/**
 * Object/file storage: Developer Connect has no file-upload feature and
 * no object-storage SDK installed (no @vercel/blob, no S3, no Firebase
 * Storage) — confirmed by inspecting package.json and the codebase, not
 * assumed. There is genuinely nothing to measure, so this is always
 * NOT_MEASURED with inUse: false rather than a fabricated 0-byte usage
 * figure or an invented capacity. If a real storage provider is ever
 * added to this project, this is the one function that should start
 * reporting its real usage.
 */
export function checkObjectStorageHealth(): ObjectStorageHealth {
  return {
    status: "NOT_MEASURED",
    summary: "No application storage in use",
    detail:
      "Developer Connect doesn't currently use any object/file storage provider (Vercel Blob, S3, Firebase Storage, or similar) — there's no file-upload feature in the product today, so there's nothing to measure here.",
    inUse: false,
    provider: null,
    storage: null,
  };
}

/**
 * The single entry point the Platform Health page (and its dashboard
 * summary) calls. Runs every independent check in parallel — a slow or
 * failing check never blocks the others — then applies the one
 * documented algorithm (algorithm.ts) to get an overall status, message,
 * and warning list. Every category here is a genuine infrastructure
 * signal; there is no developer/product-data check in this module at
 * all, so a data-quality condition is structurally incapable of
 * affecting Platform Health's status or warnings.
 */
export async function getPlatformHealth(): Promise<PlatformHealth> {
  const [database, authentication] = await Promise.all([checkDatabaseHealth(), checkAuthenticationHealth()]);
  const deployment = checkDeploymentHealth();
  const storage = checkObjectStorageHealth();

  const overallStatus = computeOverallStatus([database.status, authentication.status, deployment.status, storage.status]);
  const warnings = buildWarnings({ database, authentication, deployment });
  const overallMessage = computeOverallMessage(overallStatus, warnings);

  return {
    overallStatus,
    overallMessage,
    checkedAt: new Date(),
    database,
    authentication,
    deployment,
    storage,
    warnings,
  };
}
