/**
 * Google Analytics 4 configuration helpers. Pure functions with no
 * framework imports, so they are unit-testable and the rules live in one
 * place.
 */

/** Private or signed-in areas that must never send page views to Google Analytics. */
const EXCLUDED_PATH_PREFIXES = ["/admin", "/profile", "/post-sign-in"] as const;

/**
 * True for /admin, /profile and /post-sign-in and everything beneath them.
 * A prefix only matches at a path-segment boundary, so a public path such
 * as "/administrative" is not excluded by accident.
 */
export function isAnalyticsExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The GA4 Measurement ID to use, or null when analytics is not enabled.
 * Analytics is OFF unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set to a
 * well-formed ID, so deploying this code cannot start tracking by itself.
 * The strict format check also means the value can be safely placed in the
 * inline gtag snippet: only "G-" plus letters and digits ever gets through.
 */
export function getGaMeasurementId(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return /^G-[A-Z0-9]{6,20}$/.test(value) ? value : null;
}

/** localStorage key holding the visitor's analytics-cookie choice on this device. */
export const ANALYTICS_CONSENT_STORAGE_KEY = "dc-analytics-consent";

/**
 * "all" = the visitor pressed Accept (essential cookies + Google Analytics).
 * "essential" = "Accept only essentials" (Google Analytics is never loaded).
 * There is deliberately no third state: no choice yet is `null`, and until a
 * choice is made Google Analytics does not load.
 */
export type AnalyticsConsent = "all" | "essential";

/** Anything other than the two known values (missing, tampered, from an old version) counts as "no choice yet". */
export function parseAnalyticsConsent(raw: string | null | undefined): AnalyticsConsent | null {
  return raw === "all" || raw === "essential" ? raw : null;
}

/** Google Analytics 4 cookies: "_ga" and "_ga_<container id>". */
export function isGaCookieName(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_");
}

/** The Google Analytics cookie names present in a document.cookie string, for removal when a visitor withdraws consent. */
export function gaCookieNamesIn(cookieString: string): string[] {
  return cookieString
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter((name) => name.length > 0 && isGaCookieName(name));
}
