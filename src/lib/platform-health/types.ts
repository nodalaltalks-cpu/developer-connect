/**
 * Founder-facing platform health (standalone capability, not a product
 * phase). Every field here traces to a real measurement — a status of
 * "NOT_MEASURED" is a first-class, honest outcome, never silently shown
 * as healthy. See thresholds.ts for exactly how each status is decided.
 */
export type HealthStatus = "HEALTHY" | "NEEDS_ATTENTION" | "ACTION_REQUIRED" | "NOT_MEASURED";

export interface HealthCheckResult {
  status: HealthStatus;
  /** One short, non-technical sentence — what a Founder reads first. */
  summary: string;
  /** Longer, still-plain-language explanation shown under "View technical details". */
  detail: string;
}

export interface DatabaseStorageInfo {
  measured: boolean;
  usedBytes: number | null;
  /** Always null today — no Neon Management API key is configured, so a quota/limit is genuinely unknown and never assumed or estimated. */
  limitBytes: null;
  /** Present only when measured is false, explaining exactly why. */
  reason?: string;
}

export interface DatabaseHealth extends HealthCheckResult {
  connectionOk: boolean;
  latencyMs: number | null;
  storage: DatabaseStorageInfo;
  dataQuality: {
    developersWithoutVerifiedWebsite: number;
    candidatesWithNoEvidence: number;
    verifiedNeverReChecked: number;
  };
}

export type ApplicationHealth = HealthCheckResult;

export interface AuthenticationHealth extends HealthCheckResult {
  /** null = not measured (Clerk check itself failed to run, distinct from Clerk being reachable but erroring). */
  clerkReachable: boolean | null;
  latencyMs: number | null;
}

export interface ProductDataHealth extends HealthCheckResult {
  totalDevelopers: number;
  verifiedDevelopers: number;
  pendingVerification: number;
  developersWithoutVerifiedWebsite: number;
  candidatesWithNoEvidence: number;
  verifiedNeverReChecked: number;
}

export interface AnalyticsHealth extends HealthCheckResult {
  mostRecentEventAt: Date | null;
  eventsToday: number;
  totalEventsEver: number;
}

export interface DeploymentHealth extends HealthCheckResult {
  commitSha: string | null;
  environment: string | null;
}

export type PlatformHealthCategory =
  | "DATABASE"
  | "APPLICATION"
  | "AUTHENTICATION"
  | "PRODUCT_DATA"
  | "ANALYTICS"
  | "DEPLOYMENT";

export interface PlatformHealthWarning {
  /** Stable, deterministic id (category + condition name) — not a database row, but stable enough for the UI to key on and for future dedup work to build on. */
  id: string;
  category: PlatformHealthCategory;
  level: "NEEDS_ATTENTION" | "ACTION_REQUIRED";
  title: string;
  explanation: string;
  recommendedAction: string;
}

export interface PlatformHealth {
  overallStatus: HealthStatus;
  checkedAt: Date;
  database: DatabaseHealth;
  application: ApplicationHealth;
  authentication: AuthenticationHealth;
  productData: ProductDataHealth;
  analytics: AnalyticsHealth;
  deployment: DeploymentHealth;
  warnings: PlatformHealthWarning[];
}
