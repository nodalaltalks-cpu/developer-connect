import { DATABASE_LATENCY_THRESHOLDS_MS } from "./thresholds.ts";
import type {
  HealthStatus,
  PlatformHealthWarning,
  DatabaseHealth,
  AuthenticationHealth,
  AnalyticsHealth,
  ProductDataHealth,
  ApplicationHealth,
  DeploymentHealth,
} from "./types.ts";

/**
 * The ENTIRE overall-status algorithm, in one place, deterministic, no AI,
 * no hidden score:
 *
 *   ACTION_REQUIRED  = at least one category is ACTION_REQUIRED
 *   NEEDS_ATTENTION  = no ACTION_REQUIRED, but at least one is NEEDS_ATTENTION
 *   HEALTHY          = every measured category is HEALTHY
 *   NOT_MEASURED     = every category is NOT_MEASURED (nothing could be measured at all)
 *
 * NOT_MEASURED categories are otherwise excluded from the calculation —
 * "we don't know" never counts as either a pass or a failure, and never
 * silently degrades an otherwise-healthy platform.
 */
export function computeOverallStatus(categoryStatuses: HealthStatus[]): HealthStatus {
  if (categoryStatuses.some((s) => s === "ACTION_REQUIRED")) return "ACTION_REQUIRED";
  if (categoryStatuses.some((s) => s === "NEEDS_ATTENTION")) return "NEEDS_ATTENTION";
  if (categoryStatuses.every((s) => s === "NOT_MEASURED")) return "NOT_MEASURED";
  return "HEALTHY";
}

/**
 * Builds the founder-friendly warning cards from the same category
 * results the status came from — a warning only ever exists because a
 * documented threshold (see thresholds.ts) was genuinely crossed, never
 * invented for effect. Each warning's `id` is a stable, deterministic
 * string (category + condition), so a future persistence layer could key
 * on it directly without redesigning this function.
 */
export function buildWarnings(input: {
  database: DatabaseHealth;
  authentication: AuthenticationHealth;
  analytics: AnalyticsHealth;
  productData: ProductDataHealth;
  application: ApplicationHealth;
  deployment: DeploymentHealth;
}): PlatformHealthWarning[] {
  const warnings: PlatformHealthWarning[] = [];

  if (input.database.status === "ACTION_REQUIRED") {
    warnings.push({
      id: "database-connection-failed",
      category: "DATABASE",
      level: "ACTION_REQUIRED",
      title: "Database connection problem",
      explanation: "Developer Connect may not be able to load or save data right now.",
      recommendedAction: "Check the database connection details below.",
    });
  } else if (input.database.status === "NEEDS_ATTENTION") {
    // checkDatabaseHealth() puts a database into NEEDS_ATTENTION for two
    // unrelated reasons — genuinely slow latency, or fast-but-flagged
    // data-quality counts — and already worded `summary`/`detail`
    // correctly for whichever one actually happened. Reusing those
    // directly (rather than a second, hardcoded "responding slowly" text
    // here) is what keeps this warning honest: previously this branch
    // fired for BOTH causes with the same "Database responding slowly"
    // copy, so a fast, healthy database with only data-quality follow-up
    // was misreported as slow.
    const isSlow =
      input.database.latencyMs !== null &&
      input.database.latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.DEGRADED_ABOVE;

    warnings.push({
      id: isSlow ? "database-response-slow" : "database-data-quality",
      category: "DATABASE",
      level: "NEEDS_ATTENTION",
      title: input.database.summary,
      explanation: input.database.detail,
      recommendedAction: isSlow
        ? "Check the database details."
        : "No database performance issue — review the data-quality counts below, or see Data Quality for the full list.",
    });
  }

  if (input.authentication.status === "ACTION_REQUIRED") {
    warnings.push({
      id: "authentication-unreachable",
      category: "AUTHENTICATION",
      level: "ACTION_REQUIRED",
      title: "Sign-in service unreachable",
      explanation: "Developer Connect could not reach its sign-in provider — visitors may be unable to sign in.",
      recommendedAction: "Check the authentication details below.",
    });
  } else if (input.authentication.status === "NEEDS_ATTENTION") {
    warnings.push({
      id: "authentication-slow",
      category: "AUTHENTICATION",
      level: "NEEDS_ATTENTION",
      title: "Sign-in service responding slowly",
      explanation: "Requests to the sign-in provider are taking longer than usual.",
      recommendedAction: "Check the authentication details.",
    });
  }

  if (input.analytics.status === "NEEDS_ATTENTION") {
    warnings.push({
      id: "analytics-stopped",
      category: "ANALYTICS",
      level: "NEEDS_ATTENTION",
      title: "Analytics has stopped receiving events",
      explanation: "No analytics events have been recorded recently, even though there's a history of activity.",
      recommendedAction: "Check the analytics details.",
    });
  }

  if (input.productData.status === "NEEDS_ATTENTION") {
    const pd = input.productData;
    const reasons: string[] = [];
    if (pd.developersWithoutVerifiedWebsite > 0) {
      reasons.push(
        `${pd.developersWithoutVerifiedWebsite} active developer${pd.developersWithoutVerifiedWebsite === 1 ? "" : "s"} without a verified website`,
      );
    }
    if (pd.candidatesWithNoEvidence > 0) {
      reasons.push(
        `${pd.candidatesWithNoEvidence} candidate${pd.candidatesWithNoEvidence === 1 ? "" : "s"} awaiting review with no evidence attached`,
      );
    }
    // Never set anywhere yet (no periodic re-verification exists) — every
    // VERIFIED candidate legitimately matches this until that automation
    // is built, so it's called out separately as "expected for now"
    // rather than implied to be equally urgent as the two counts above.
    const onlyNeverRechecked = reasons.length === 0 && pd.verifiedNeverReChecked > 0;
    if (pd.verifiedNeverReChecked > 0) {
      reasons.push(
        `${pd.verifiedNeverReChecked} verified website${pd.verifiedNeverReChecked === 1 ? "" : "s"} never re-checked since approval`,
      );
    }

    warnings.push({
      id: "product-data-quality",
      category: "PRODUCT_DATA",
      level: "NEEDS_ATTENTION",
      title: "Some data-quality issues need review",
      explanation:
        reasons.length > 0
          ? `${reasons.join("; ")}.`
          : "A few developer records need attention — see Data Quality for the exact list.",
      recommendedAction: onlyNeverRechecked
        ? "No urgent action needed — Developer Connect doesn't yet run automatic re-verification, so this is expected. Periodically reopen a verified developer's record to reconfirm its website."
        : "Review Data Quality for the specific records that need attention.",
    });
  }

  return warnings;
}
