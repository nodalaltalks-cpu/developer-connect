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
    warnings.push({
      id: "database-response-slow",
      category: "DATABASE",
      level: "NEEDS_ATTENTION",
      title: "Database responding slowly",
      explanation: "Some database requests are taking longer than usual.",
      recommendedAction: "Check the database details.",
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
    warnings.push({
      id: "product-data-quality",
      category: "PRODUCT_DATA",
      level: "NEEDS_ATTENTION",
      title: "Some data-quality issues need review",
      explanation: "A few developer records need attention — see Data Quality for the exact list.",
      recommendedAction: "Review Data Quality.",
    });
  }

  return warnings;
}
