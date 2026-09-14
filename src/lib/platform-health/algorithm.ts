import { DATABASE_LATENCY_THRESHOLDS_MS, DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT } from "./thresholds.ts";
import type { HealthStatus, PlatformHealthWarning, DatabaseHealth, AuthenticationHealth, DeploymentHealth } from "./types.ts";

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
 *
 * Every input category here is a genuine infrastructure/technical signal
 * (database, sign-in provider, deployment, object storage) — developer
 * verification status and other product/data-quality signals are never
 * passed into this function, by construction (see health-checks.ts).
 */
export function computeOverallStatus(categoryStatuses: HealthStatus[]): HealthStatus {
  if (categoryStatuses.some((s) => s === "ACTION_REQUIRED")) return "ACTION_REQUIRED";
  if (categoryStatuses.some((s) => s === "NEEDS_ATTENTION")) return "NEEDS_ATTENTION";
  if (categoryStatuses.every((s) => s === "NOT_MEASURED")) return "NOT_MEASURED";
  return "HEALTHY";
}

/**
 * The single sentence shown at the top of the page. Real-data-driven: the
 * most severe active warning's own explanation (already correctly worded
 * for its exact cause) when one exists, otherwise a canonical per-status
 * message. Never a generic "something needs attention" that could be
 * caused by developer/product data — this function's only inputs are the
 * warnings this module itself produced from infrastructure checks.
 */
export function computeOverallMessage(overallStatus: HealthStatus, warnings: PlatformHealthWarning[]): string {
  const mostSevere =
    warnings.find((w) => w.level === "ACTION_REQUIRED") ?? warnings.find((w) => w.level === "NEEDS_ATTENTION");
  if (mostSevere) return mostSevere.explanation;

  switch (overallStatus) {
    case "HEALTHY":
      return "Everything is running normally.";
    case "NOT_MEASURED":
      return "Infrastructure health could not be measured right now.";
    case "NEEDS_ATTENTION":
      return "You're approaching an infrastructure limit.";
    case "ACTION_REQUIRED":
      return "An infrastructure service is unavailable.";
  }
}

/**
 * Builds the founder-friendly warning cards from the same category
 * results the status came from — a warning only ever exists because a
 * documented threshold (see thresholds.ts) was genuinely crossed, never
 * invented for effect. Each warning's `id` is a stable, deterministic
 * string (category + condition), so a future persistence layer could key
 * on it directly without redesigning this function.
 *
 * Deliberately takes ONLY infrastructure category results — there is no
 * parameter here for developer/product/data-quality signals, so a
 * warning driven by that kind of data is structurally impossible to
 * produce from this function.
 */
export function buildWarnings(input: {
  database: DatabaseHealth;
  authentication: AuthenticationHealth;
  deployment: DeploymentHealth;
}): PlatformHealthWarning[] {
  const warnings: PlatformHealthWarning[] = [];

  if (input.database.status === "ACTION_REQUIRED" || input.database.status === "NEEDS_ATTENTION") {
    const level = input.database.status;
    const { connectionOk, latencyMs, storage } = input.database;
    const usagePercent = storage.usagePercent;

    // Deterministic cause selection from the real measured fields —
    // never inferred by elimination. Checked in the same priority order
    // checkDatabaseHealth() itself uses to assign the status.
    let id: string;
    let recommendedAction: string;
    if (!connectionOk) {
      id = "database-connection-failed";
      recommendedAction = "Check the database connection details below.";
    } else if (latencyMs !== null && latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.DEGRADED_ABOVE) {
      id = level === "ACTION_REQUIRED" ? "database-response-critical" : "database-response-slow";
      recommendedAction = "Check the database details.";
    } else if (
      usagePercent !== null &&
      usagePercent >= DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT.NEEDS_ATTENTION_ABOVE
    ) {
      id = level === "ACTION_REQUIRED" ? "database-storage-critical" : "database-storage-high";
      recommendedAction = "Consider increasing database storage capacity with your provider.";
    } else {
      // Defensive fallback — should be unreachable given checkDatabaseHealth()'s own logic.
      id = "database-issue";
      recommendedAction = "Check the database details below.";
    }

    warnings.push({
      id,
      category: "DATABASE",
      level,
      title: input.database.summary,
      explanation: input.database.detail,
      recommendedAction,
    });
  }

  if (input.authentication.status === "ACTION_REQUIRED") {
    warnings.push({
      id: "authentication-unreachable",
      category: "AUTHENTICATION",
      level: "ACTION_REQUIRED",
      title: "Sign-in service unreachable",
      explanation: "Developer Connects could not reach its sign-in provider — visitors may be unable to sign in.",
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

  return warnings;
}
