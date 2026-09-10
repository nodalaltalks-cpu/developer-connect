/**
 * Every magic number Platform Health uses to turn a raw measurement into
 * a status, in ONE place — never scattered across UI components. None of
 * these are verified industry standards; each is a documented, reasoned
 * starting point for an early-stage, low-traffic product, chosen so the
 * page fails toward "not measured" or a mild warning rather than a false
 * alarm. Adjust here only; every check reads these constants.
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
 * How long a health check itself is allowed to hang before being treated
 * as failed. Applies to the Clerk reachability call — a slow provider
 * must not hang the whole Platform Health page.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Analytics staleness: how long with zero events before flagging
 * "analytics may have stopped", rather than "nobody is using the
 * product right now". Why 24 hours, not something shorter: at this
 * product's current traffic level, quiet periods of several hours are
 * completely normal and must never read as a system failure — see
 * analytics-health.ts for the explicit distinction this threshold
 * exists to protect (no history at all is a DIFFERENT, non-alarming
 * state: "NOT_MEASURED / no activity yet", never a warning).
 */
export const ANALYTICS_STALE_AFTER_HOURS = 24;

/**
 * Product-data thresholds are informational only (Part 9 asks for
 * simple counts, not a pass/fail gate) — any non-zero count here nudges
 * overall status to NEEDS_ATTENTION at most, never ACTION_REQUIRED,
 * since stale/incomplete verification data is a backlog to work through,
 * not an outage.
 */
export const PRODUCT_DATA_ATTENTION_IF_ANY_OF = [
  "developersWithoutVerifiedWebsite",
  "candidatesWithNoEvidence",
  "verifiedNeverReChecked",
] as const;
