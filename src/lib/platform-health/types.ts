/**
 * Founder-facing platform health — an INFRASTRUCTURE-ONLY dashboard.
 * Every field here traces to a real measurement of the technical
 * plumbing (database, sign-in provider, deployment, object storage) —
 * never developer verification status, data-quality backlogs, or any
 * other product/business data. Those live in Data Quality, Verification,
 * and Developers instead. A status of "NOT_MEASURED" is a first-class,
 * honest outcome, never silently shown as healthy. See thresholds.ts for
 * exactly how each status is decided.
 */
export type HealthStatus = "HEALTHY" | "NEEDS_ATTENTION" | "ACTION_REQUIRED" | "NOT_MEASURED";

export interface HealthCheckResult {
  status: HealthStatus;
  /** One short, non-technical sentence — what a Founder reads first. */
  summary: string;
  /** Longer, still-plain-language explanation shown under "View technical details". */
  detail: string;
}

/**
 * Real, measured database storage and — only when the provider actually
 * exposes one — its capacity. `capacityBytes` is null today: this
 * project has no Neon Management API credential configured (no
 * NEON_API_KEY), and Neon's Postgres connection itself carries no quota
 * concept, so a capacity genuinely cannot be read. `remainingBytes` and
 * `usagePercent` are ALWAYS derived strictly from usedBytes/capacityBytes
 * when both are known — never estimated, never assumed from a plan name.
 */
export interface CapacityInfo {
  measured: boolean;
  usedBytes: number | null;
  capacityBytes: number | null;
  /** Always capacityBytes - usedBytes; null whenever capacityBytes is null. */
  remainingBytes: number | null;
  /** Always (usedBytes / capacityBytes) * 100; null whenever capacityBytes is null. */
  usagePercent: number | null;
  /** Present only when usedBytes itself couldn't be measured (e.g. connection failure). */
  reason?: string;
  /** Present only when usedBytes is known but capacityBytes genuinely isn't — explains exactly why, never invented. */
  capacityUnavailableReason?: string;
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
  storage: CapacityInfo;
  /** Real per-table size/row-count breakdown for every application table — empty only if storage itself couldn't be measured. */
  tableBreakdown: DatabaseTableBreakdown[];
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
  storage: CapacityInfo | null;
}

export interface AuthenticationHealth extends HealthCheckResult {
  /** null = not measured (Clerk check itself failed to run, distinct from Clerk being reachable but erroring). */
  clerkReachable: boolean | null;
  latencyMs: number | null;
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

export type PlatformHealthCategory = "DATABASE" | "AUTHENTICATION" | "DEPLOYMENT" | "STORAGE";

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
  /** The single sentence shown at the top of the page — the most severe active warning's explanation, or a canonical "everything normal" message. Never derived from developer/data-quality signals. */
  overallMessage: string;
  checkedAt: Date;
  database: DatabaseHealth;
  authentication: AuthenticationHealth;
  deployment: DeploymentHealth;
  storage: ObjectStorageHealth;
  warnings: PlatformHealthWarning[];
}
