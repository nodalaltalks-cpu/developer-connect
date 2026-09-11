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

/**
 * One row's real, measured share of database storage — `sizeBytes` from
 * Postgres's own pg_total_relation_size() (table + its indexes + TOAST,
 * a cheap metadata read, never a scan), `rowCount` from an exact count()
 * on that one table (cheap at this project's current scale). Never an
 * estimate presented as exact, and never fabricated for a table this
 * project doesn't actually have.
 */
export interface DatabaseTableBreakdown {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  /** Share of the database's total measured size (pg_database_size). Null only if total size itself isn't measured. Tables not individually broken out (small system catalogs, etc.) mean these percentages legitimately don't sum to 100. */
  percentOfTotal: number | null;
}

export interface DatabaseHealth extends HealthCheckResult {
  connectionOk: boolean;
  latencyMs: number | null;
  storage: DatabaseStorageInfo;
  /** Real per-table size/row-count breakdown for every application table — empty only if storage itself couldn't be measured. */
  tableBreakdown: DatabaseTableBreakdown[];
  dataQuality: {
    developersWithoutVerifiedWebsite: number;
    candidatesWithNoEvidence: number;
    verifiedNeverReChecked: number;
  };
}

/**
 * Whether Developer Connect uses any object/file storage provider (Vercel
 * Blob, S3, Firebase Storage, etc.) at all. As of this check, it does
 * not — there is no file-upload feature in the product — so this is
 * always NOT_MEASURED with inUse: false, never a fabricated capacity.
 * Structured so that if a real storage provider is ever added, this
 * function is the one place that would start reporting real usage.
 */
export interface ObjectStorageHealth extends HealthCheckResult {
  inUse: boolean;
  provider: string | null;
}

export type ApplicationHealth = HealthCheckResult;

export interface AuthenticationHealth extends HealthCheckResult {
  /** null = not measured (Clerk check itself failed to run, distinct from Clerk being reachable but erroring). */
  clerkReachable: boolean | null;
  latencyMs: number | null;
}

/**
 * Every developer, bucketed by its single EFFECTIVE verification status —
 * the same derivation getDeveloperIntelligence() uses for the
 * /admin/developers status filter (see effectiveVerificationStatusSql()
 * in admin-analytics/queries.ts), so these counts always agree with what
 * a Founder sees when filtering that list by status. Counts developers,
 * not website candidates — a developer with several candidates is
 * counted exactly once, under whichever status currently matters most.
 */
export interface DeveloperStatusBreakdown {
  discovered: number;
  pendingVerification: number;
  verified: number;
  needsReverification: number;
  rejected: number;
  inactive: number;
}

/** Real, exact row counts for every other application table — never derived from developer counts, never estimated. */
export interface EntityCounts {
  websiteCandidates: number;
  evidence: number;
  verificationEvents: number;
  profiles: number;
  notifications: number;
  analyticsEvents: number;
}

export interface ProductDataHealth extends HealthCheckResult {
  totalDevelopers: number;
  verifiedDevelopers: number;
  pendingVerification: number;
  developersWithoutVerifiedWebsite: number;
  candidatesWithNoEvidence: number;
  verifiedNeverReChecked: number;
  developerStatusBreakdown: DeveloperStatusBreakdown;
  entityCounts: EntityCounts;
}

export interface AnalyticsHealth extends HealthCheckResult {
  mostRecentEventAt: Date | null;
  eventsToday: number;
  totalEventsEver: number;
}

export interface DeploymentHealth extends HealthCheckResult {
  commitSha: string | null;
  environment: string | null;
  /** VERCEL_URL — the deployment's own generated hostname. Null off Vercel. */
  deploymentUrl: string | null;
  /** VERCEL_REGION — the execution region actually serving this request. Null off Vercel. */
  region: string | null;
  /** VERCEL_GIT_COMMIT_REF — the branch this deployment was built from. Null off Vercel. */
  gitBranch: string | null;
  /** VERCEL_DEPLOYMENT_ID — Vercel's own identifier for this deployment. Null off Vercel. */
  deploymentId: string | null;
}

export type PlatformHealthCategory =
  | "DATABASE"
  | "APPLICATION"
  | "AUTHENTICATION"
  | "PRODUCT_DATA"
  | "ANALYTICS"
  | "DEPLOYMENT"
  | "STORAGE";

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
  storage: ObjectStorageHealth;
  warnings: PlatformHealthWarning[];
}
