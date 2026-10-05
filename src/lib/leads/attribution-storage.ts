import { ANALYTICS_CONSENT_STORAGE_KEY, isAnalyticsExcludedPath, parseAnalyticsConsent } from "../analytics-config.ts";
import {
  CURRENT_TOUCH_KEY,
  FIRST_TOUCH_KEY,
  attributionPayload,
  nextCurrentTouch,
  nextFirstTouch,
  parseStoredTouch,
  touchFromLocation,
} from "./attribution-client.ts";

/**
 * The DOM-facing half of attribution capture. Every function guards for a
 * missing `window` and swallows storage errors (private browsing, blocked
 * storage), because attribution is a nicety that must never break a page.
 *
 * Storage rules (see attribution-client.ts for the decisions themselves):
 *  - sessionStorage always holds the current and first touch for this visit;
 *  - localStorage ALSO holds the first touch, but ONLY when the visitor has
 *    accepted analytics cookies, so it can survive across visits.
 */

function safe<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

function analyticsAccepted(): boolean {
  return safe(() => parseAnalyticsConsent(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) === "all", false);
}

/** Records how this page view arrived. Call on load and on each in-app navigation. */
export function recordTouchFromWindow(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, host } = window.location;
  if (isAnalyticsExcludedPath(pathname)) return; // private areas are never attributed

  const incoming = touchFromLocation({ search, pathname, referrer: document.referrer, ownHost: host, now: new Date() });

  safe(() => {
    const current = parseStoredTouch(sessionStorage.getItem(CURRENT_TOUCH_KEY));
    sessionStorage.setItem(CURRENT_TOUCH_KEY, JSON.stringify(nextCurrentTouch(current, incoming)));

    const sessionFirst = parseStoredTouch(sessionStorage.getItem(FIRST_TOUCH_KEY));
    const persistedFirst = analyticsAccepted() ? parseStoredTouch(localStorage.getItem(FIRST_TOUCH_KEY)) : null;
    const first = nextFirstTouch(persistedFirst ?? sessionFirst, incoming);
    sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first));
    if (analyticsAccepted()) localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first));
  }, undefined);
}

/** The attribution to send with a gate submission (the server cleans it again and attaches its own session id). */
export function readAttributionForSubmit() {
  if (typeof window === "undefined") return undefined;
  const current = safe(() => parseStoredTouch(sessionStorage.getItem(CURRENT_TOUCH_KEY)), null);
  const first = safe(() => parseStoredTouch(sessionStorage.getItem(FIRST_TOUCH_KEY)), null);
  return attributionPayload(current, first);
}
