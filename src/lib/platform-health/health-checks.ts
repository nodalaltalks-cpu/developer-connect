import { sql, gte, count } from "drizzle-orm";
import { getDb } from "../developer-connect/db/client.ts";
import { analyticsEvents } from "../developer-connect/db/schema.ts";
import { getDataQuality, getExecutiveOverview } from "../admin-analytics/queries.ts";
import {
  DATABASE_LATENCY_THRESHOLDS_MS,
  AUTHENTICATION_LATENCY_THRESHOLDS_MS,
  ANALYTICS_STALE_AFTER_HOURS,
  HEALTH_CHECK_TIMEOUT_MS,
} from "./thresholds.ts";
import { computeOverallStatus, buildWarnings } from "./algorithm.ts";
import type {
  DatabaseHealth,
  ApplicationHealth,
  AuthenticationHealth,
  ProductDataHealth,
  AnalyticsHealth,
  DeploymentHealth,
  PlatformHealth,
} from "./types.ts";

/**
 * Database: a real timed query (never a row count pretending to be
 * storage) plus the existing data-quality signals — reused, not
 * duplicated. Storage is measured via Postgres's own
 * pg_database_size(), which needs no extra credentials beyond the
 * connection this app already has; the plan's storage LIMIT is not
 * measurable without a Neon Management API key, which this project does
 * not have configured, so it is reported as unmeasured rather than
 * assumed.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const dataQuality = await getDataQuality();

  let connectionOk = true;
  let latencyMs: number | null = null;
  let usedBytes: number | null = null;
  let storageMeasured = false;
  let storageReason: string | undefined;

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
  } catch {
    connectionOk = false;
    storageReason = "Storage usage cannot be checked while the database connection itself is failing.";
  }

  const hasQualityIssue =
    dataQuality.developersWithoutVerifiedWebsite > 0 ||
    dataQuality.candidatesWithNoEvidence > 0 ||
    dataQuality.verifiedNeverReChecked > 0;

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
  } else if (hasQualityIssue) {
    status = "NEEDS_ATTENTION";
    summary = "Database is working normally, with some data to review";
    detail = "The connection and speed are fine — a few developer records need attention (see below).";
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
    storage: {
      measured: storageMeasured,
      usedBytes,
      limitBytes: null,
      reason: storageMeasured
        ? undefined
        : (storageReason ?? "Developer Connect cannot currently read your Neon storage usage."),
    },
    dataQuality: {
      developersWithoutVerifiedWebsite: dataQuality.developersWithoutVerifiedWebsite,
      candidatesWithNoEvidence: dataQuality.candidatesWithNoEvidence,
      verifiedNeverReChecked: dataQuality.verifiedNeverReChecked,
    },
  };
}

/**
 * Application: honestly NOT_MEASURED. No APM/error-tracking vendor is
 * wired into this app — pretending a page render proves the application
 * is healthy would be exactly the fabricated-health this feature exists
 * to avoid (a rendering page tells you almost nothing about request
 * failures, background errors, or degraded paths elsewhere).
 */
export function checkApplicationHealth(): ApplicationHealth {
  return {
    status: "NOT_MEASURED",
    summary: "Detailed application monitoring isn't connected yet",
    detail:
      "Developer Connect doesn't have an application-performance monitoring tool wired up, so request-level errors and latency aren't tracked here yet.",
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

/** Product data: reuses the existing executive-overview + data-quality queries — no new tables, no new counts invented. */
export async function checkProductDataHealth(): Promise<ProductDataHealth> {
  const [overview, dataQuality] = await Promise.all([getExecutiveOverview(), getDataQuality()]);

  const hasIssue =
    dataQuality.developersWithoutVerifiedWebsite > 0 ||
    dataQuality.candidatesWithNoEvidence > 0 ||
    dataQuality.verifiedNeverReChecked > 0;

  const status = overview.developersTracked === 0 ? "NOT_MEASURED" : hasIssue ? "NEEDS_ATTENTION" : "HEALTHY";
  const summary =
    overview.developersTracked === 0
      ? "No developer records yet"
      : hasIssue
        ? "Some data-quality issues need review"
        : "Developer data looks healthy";
  const detail =
    overview.developersTracked === 0
      ? "Nothing to check yet — this fills in once developers are added."
      : "See the counts below for exactly what needs review, and Data Quality for the full list.";

  return {
    status,
    summary,
    detail,
    totalDevelopers: overview.developersTracked,
    verifiedDevelopers: overview.verifiedDevelopers,
    pendingVerification: overview.pendingVerification,
    developersWithoutVerifiedWebsite: dataQuality.developersWithoutVerifiedWebsite,
    candidatesWithNoEvidence: dataQuality.candidatesWithNoEvidence,
    // Previously computed into `hasIssue` above but never returned, so a
    // NEEDS_ATTENTION status driven entirely by this count showed as "0
    // issues" everywhere the other two counts are displayed. Now carried
    // through so the Founder can actually see what's flagged.
    verifiedNeverReChecked: dataQuality.verifiedNeverReChecked,
  };
}

/**
 * Analytics: recency + volume from the existing analytics_events table.
 * The one rule this exists to enforce: zero events ever recorded is
 * "nothing to measure yet", never a failure — it's indistinguishable
 * from a product with no traffic, which is not a system problem.
 */
export async function checkAnalyticsHealth(): Promise<AnalyticsHealth> {
  const db = getDb();

  const [mostRecentRow] = await db
    .select({ occurredAt: analyticsEvents.occurredAt })
    .from(analyticsEvents)
    .orderBy(sql`${analyticsEvents.occurredAt} desc`)
    .limit(1);

  const [totalRow] = await db.select({ n: count() }).from(analyticsEvents);
  const totalEventsEver = totalRow?.n ?? 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [todayRow] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.occurredAt, startOfToday));
  const eventsToday = todayRow?.n ?? 0;

  const mostRecentEventAt = mostRecentRow?.occurredAt ?? null;

  if (totalEventsEver === 0) {
    return {
      status: "NOT_MEASURED",
      summary: "No user activity recorded yet",
      detail: "This isn't a problem — it just means nobody has used Developer Connect yet.",
      mostRecentEventAt: null,
      eventsToday: 0,
      totalEventsEver: 0,
    };
  }

  const hoursSinceLastEvent = mostRecentEventAt
    ? (Date.now() - mostRecentEventAt.getTime()) / (1000 * 60 * 60)
    : Infinity;

  if (hoursSinceLastEvent > ANALYTICS_STALE_AFTER_HOURS) {
    return {
      status: "NEEDS_ATTENTION",
      summary: "Analytics has stopped receiving events",
      detail: `No analytics events have been recorded for over ${ANALYTICS_STALE_AFTER_HOURS} hours, even though there's a history of activity.`,
      mostRecentEventAt,
      eventsToday,
      totalEventsEver,
    };
  }

  return {
    status: "HEALTHY",
    summary: "Receiving events normally",
    detail: "Analytics is recording activity as expected.",
    mostRecentEventAt,
    eventsToday,
    totalEventsEver,
  };
}

/**
 * Deployment: only what Vercel automatically injects at build/runtime
 * (commit SHA, environment) — no Vercel API token exists in this
 * project, so live deployment status (building/ready/error) is not
 * measurable and is reported as such rather than guessed.
 */
export function checkDeploymentHealth(): DeploymentHealth {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const environment = process.env.VERCEL_ENV ?? null;

  if (!commitSha) {
    return {
      status: "NOT_MEASURED",
      summary: "Deployment monitoring isn't connected",
      detail:
        "Live deployment monitoring is not currently connected — Developer Connect can only show this when running on Vercel.",
      commitSha: null,
      environment,
    };
  }

  return {
    status: "HEALTHY",
    summary: "Running the expected deployment",
    detail: "This is the commit and environment currently serving Developer Connect.",
    commitSha,
    environment,
  };
}

/**
 * The single entry point the Platform Health page (and its dashboard
 * summary) calls. Runs every independent check in parallel — a slow or
 * failing check never blocks the others — then applies the one
 * documented algorithm (algorithm.ts) to get an overall status and
 * warning list.
 */
export async function getPlatformHealth(): Promise<PlatformHealth> {
  const [database, authentication, productData, analytics] = await Promise.all([
    checkDatabaseHealth(),
    checkAuthenticationHealth(),
    checkProductDataHealth(),
    checkAnalyticsHealth(),
  ]);
  const application = checkApplicationHealth();
  const deployment = checkDeploymentHealth();

  const overallStatus = computeOverallStatus([
    database.status,
    application.status,
    authentication.status,
    productData.status,
    analytics.status,
    deployment.status,
  ]);

  const warnings = buildWarnings({ database, authentication, analytics, productData, application, deployment });

  return {
    overallStatus,
    checkedAt: new Date(),
    database,
    application,
    authentication,
    productData,
    analytics,
    deployment,
    warnings,
  };
}
