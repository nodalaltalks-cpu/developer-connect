import { ANALYTICS_CONSENT_STORAGE_KEY, parseAnalyticsConsent } from "../analytics-config.ts";

/**
 * Browser side of the social collector. It stays silent when the visitor chose "Accept only essentials", when the browser sends
 * Do Not Track or Global Privacy Control, and it never sends anything typed. A failure is swallowed so it can never affect a page.
 */

type Payload = Record<string, unknown>;

function allowed(): boolean {
  try {
    if (parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) === "essential") return false;
  } catch {
    // storage blocked: fall through
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  return !(nav.globalPrivacyControl === true || nav.doNotTrack === "1");
}

export function trackSocial(event: Payload): void {
  try {
    if (typeof window === "undefined" || !allowed()) return;
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      events: [{ ...event, utmSource: params.get("utm_source") ?? undefined, utmMedium: params.get("utm_medium") ?? undefined, utmCampaign: params.get("utm_campaign") ?? undefined, referrer: document.referrer || undefined }],
    });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/social-events", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/social-events", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch {
    // never let analytics break the page
  }
}
