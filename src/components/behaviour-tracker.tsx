"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CONSENT_STORAGE_KEY, isAnalyticsExcludedPath, parseAnalyticsConsent } from "@/lib/analytics-config";
import { PageEngagement } from "@/lib/behaviour/tracker-core";

/**
 * Sends first-party visitor behaviour to /api/events: a page view, one engagement summary per page when the visitor
 * leaves (visible+active seconds, deepest scroll, clicks) and tracked button clicks (elements with data-cta).
 *
 * It never sends anything typed, no full URL (path only) and nothing from private areas. It stays silent when the
 * visitor chose "Accept only essentials", when the browser sends Do Not Track or Global Privacy Control, and on the
 * server side bots are ignored too. Renders nothing; a failure is swallowed so it can never affect a page.
 */

type Payload = Record<string, unknown>;

function trackingAllowed(): boolean {
  try {
    if (parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) === "essential") return false;
  } catch {
    // storage blocked: fall through
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return false;
  return true;
}

function send(events: Payload[]): void {
  if (events.length === 0) return;
  try {
    const body = JSON.stringify({ events });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch {
    // never let analytics break the page
  }
}

export function BehaviourTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || isAnalyticsExcludedPath(pathname) || !trackingAllowed()) return;

    const engagement = new PageEngagement(Date.now());
    let flushed = false;

    const params = new URLSearchParams(window.location.search);
    send([
      {
        name: "page_viewed",
        path: pathname,
        referrer: document.referrer || undefined,
        utmSource: params.get("utm_source") ?? undefined,
        utmMedium: params.get("utm_medium") ?? undefined,
        utmCampaign: params.get("utm_campaign") ?? undefined,
        hasGclid: params.has("gclid") || undefined,
        hasFbclid: params.has("fbclid") || undefined,
        viewportWidth: window.innerWidth,
      },
    ]);

    const onActivity = () => engagement.activity(Date.now());
    const onScroll = () => engagement.scroll(window.scrollY, window.innerHeight, document.documentElement.scrollHeight, Date.now());
    const onClick = (event: Event) => {
      engagement.click(Date.now());
      const target = (event.target as Element | null)?.closest?.("[data-cta]");
      const ctaId = target?.getAttribute("data-cta");
      if (ctaId) send([{ name: "cta_clicked", path: pathname, ctaId }]);
    };
    const flush = () => {
      if (flushed) return;
      flushed = true;
      send([{ name: "page_engagement", path: pathname, ...engagement.summary() }]);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    onScroll(); // a short page is fully seen on arrival
    const timer = window.setInterval(() => engagement.tick(Date.now(), document.visibilityState === "visible"), 1000);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush(); // client-side navigation to another page
    };
  }, [pathname]);

  return null;
}
