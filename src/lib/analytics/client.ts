import { ANALYTICS_CONSENT_STORAGE_KEY, getGoogleAdsConversionLabel, getGoogleAdsId, isAnalyticsExcludedPath, parseAnalyticsConsent } from "../analytics-config.ts";
import { META_EVENT, cleanParams, isAnalyticsEvent, newEventId, type AnalyticsEventName, type AnalyticsParams } from "./events.ts";

/**
 * The browser side: send one clean event to Google Analytics and Meta, only if the visitor accepted measurement cookies, never on a
 * private page, never when the browser sends Do Not Track or Global Privacy Control, and never anything that is not on the allow-list.
 * Returns the event id (shared with the server so a conversion is counted once) or null when nothing was sent.
 */

type Gtag = (command: "event", name: string, params: Record<string, unknown>) => void;
type Fbq = (command: "track" | "trackCustom", name: string, params: Record<string, unknown>, options: { eventID: string }) => void;

export function measurementAllowed(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (isAnalyticsExcludedPath(pathname)) return false;
  try {
    if (parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) !== "all") return false;
  } catch {
    return false;
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  return !(nav.globalPrivacyControl === true || nav.doNotTrack === "1");
}

export function trackEvent(name: AnalyticsEventName, params?: Record<string, unknown>): string | null {
  if (!isAnalyticsEvent(name) || typeof window === "undefined") return null;
  const pathname = window.location.pathname;
  if (!measurementAllowed(pathname)) return null;
  const clean: AnalyticsParams = cleanParams(params);
  const eventId = newEventId();
  const w = window as unknown as { gtag?: Gtag; fbq?: Fbq };
  try {
    w.gtag?.("event", name, { ...clean, event_id: eventId });
    const metaName = META_EVENT[name];
    if (metaName && w.fbq) w.fbq("track", metaName, clean, { eventID: eventId });
  } catch {
    // measurement must never break the page
  }
  return eventId;
}

/**
 * Reports a saved lead to Google Ads as a conversion. Needs the Ads id AND conversion label to be configured and the same
 * measurement permission as every other event (pass the event id trackEvent returned: null means nothing was allowed, so nothing
 * is sent). The event id doubles as the transaction id, so a repeat of the same lead is counted once. Carries no personal data.
 */
export function trackAdsLeadConversion(eventId: string | null): boolean {
  if (!eventId || typeof window === "undefined") return false;
  const adsId = getGoogleAdsId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);
  const label = getGoogleAdsConversionLabel(process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL);
  if (!adsId || !label) return false;
  const gtag = (window as unknown as { gtag?: (command: "event", name: string, params: Record<string, unknown>) => void }).gtag;
  if (!gtag) return false;
  try {
    gtag("event", "conversion", { send_to: `${adsId}/${label}`, transaction_id: eventId });
    return true;
  } catch {
    return false;
  }
}
