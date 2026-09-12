/**
 * Every magic number Platform Health uses to turn a raw measurement into
 * a status, in ONE place — never scattered across UI components. None of
 * these are verified industry standards; each is a documented, reasoned
 * starting point for an early-stage, low-traffic product, chosen so the
 * page fails toward "not measured" or a mild warning rather than a false
 * alarm. Adjust here only; every check reads these constants.
 *
 * Every threshold here governs INFRASTRUCTURE conditions only (latency,
 * capacity) — there is deliberately no threshold for developer/data-
 * quality counts; those never influence Platform Health.
 */

export const DATABASE_LATENCY_THRESHOLDS_MS = {
  /**
   * Below this, the database is considered responding normally.
   * Why: a simple `select 1`-class query against Neon's pooled connection
   * typically completes in well under 200ms when healthy; this leaves
   * headroom for normal network jitter without crying wolf.
   */
  DEGRADED_ABOVE: 200,
  /**
   * Above this, treated as a genuine problem worth the Founder's
   * attention, not just noise — a health-check query is about the
   * simplest round-trip the app makes, so anything this slow signals a
   * real underlying issue (not application logic, since none runs here).
   */
  CRITICAL_ABOVE: 1000,
} as const;

export const AUTHENTICATION_LATENCY_THRESHOLDS_MS = {
  /** Clerk's own Backend API is a third-party network call, inherently slower than a local DB round-trip — a wider margin than the database threshold is intentional, not inconsistent. */
  DEGRADED_ABOVE: 800,
  CRITICAL_ABOVE: 3000,
} as const;

/**
 * Storage-usage-percent thresholds — only ever evaluated when a real
 * capacityBytes is known (see CapacityInfo in types.ts). In this
 * project's current environment, no provider quota is available, so
 * these are inert until a real capacity measurement exists; they are
 * defined now so that day never requires new threshold logic.
 */
export const DATABASE_STORAGE_USAGE_THRESHOLDS_PERCENT = {
  NEEDS_ATTENTION_ABOVE: 80,
  ACTION_REQUIRED_ABOVE: 95,
} as const;

/**
 * How long a health check itself is allowed to hang before being treated
 * as failed. Applies to the Clerk reachability call — a slow provider
 * must not hang the whole Platform Health page.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;
