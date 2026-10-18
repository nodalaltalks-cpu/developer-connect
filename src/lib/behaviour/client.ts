import { ANALYTICS_CONSENT_STORAGE_KEY, parseAnalyticsConsent } from "../analytics-config.ts";

/**
 * The browser side of first-party behaviour tracking, shared by the page tracker and by any component that records its own event
 * (the install banner). Same rules everywhere: silent when the visitor chose "only essentials" or the browser sends Do Not Track /
 * Global Privacy Control; a failure is swallowed so it can never affect a page.
 */

export type BehaviourPayload = Record<string, unknown>;

/**
 * `essentialOk` is for the few anonymous, first-party counts the privacy and cookie policies say are kept whatever the cookie choice
 * (the install banner's outcomes): "Accept only essentials" does not stop them, but a Do Not Track / Global Privacy Control signal still does.
 */
export function trackingAllowed(essentialOk = false): boolean {
  if (!essentialOk) {
    try {
      if (parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) === "essential") return false;
    } catch {
      // storage blocked: fall through
    }
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return false;
  return true;
}

export function sendBehaviourEvents(events: BehaviourPayload[]): void {
  if (events.length === 0) return;
  try {
    const body = JSON.stringify({ events });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch {
    // never let analytics break the page
  }
}

/** Records one button-style event (an allow-listed ctaId) for the page the visitor is on. Does nothing when tracking is not allowed. */
export function trackCta(ctaId: string, pathname: string, essentialOk = false): void {
  if (!trackingAllowed(essentialOk)) return;
  sendBehaviourEvents([{ name: "cta_clicked", path: pathname, ctaId }]);
}
