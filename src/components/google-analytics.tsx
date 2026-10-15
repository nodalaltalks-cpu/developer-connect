"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { isAnalyticsExcludedPath } from "@/lib/analytics-config";

/**
 * Loads Google Analytics 4 (gtag.js) using next/script, only for public
 * pages. The parent (the root layout) renders this only when a valid
 * measurement ID is configured — see getGaMeasurementId — so with no ID
 * nothing here ever runs.
 *
 * Private areas (/admin, /profile, /post-sign-in) are excluded two ways:
 *  - if the first page a visitor lands on is one of them, nothing is
 *    loaded at all (no request to Google);
 *  - once the script is loaded, Google's documented per-property opt-out
 *    flag (window["ga-disable-<ID>"]) is switched on while the visitor is
 *    on an excluded path, and off again on public paths.
 * Client-side navigation can race that flag by a moment, so one stray
 * private-page hit is possible in rare cases; an internal-traffic filter in
 * GA is the backstop for the Founder's own visits.
 *
 * With a Google Ads id it also configures the Ads tag (conversion measurement for the paid campaigns), under the same consent.
 *
 * Page views after the first are recorded by GA4's built-in "page changes
 * based on browser history events" measurement, so no manual page_view
 * calls are needed for App Router navigation.
 */
export function GoogleAnalytics({ measurementId, adsId = null }: { measurementId: string | null; adsId?: string | null }) {
  const pathname = usePathname();
  const excluded = isAnalyticsExcludedPath(pathname);

  useEffect(() => {
    if (measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = excluded;
  }, [excluded, measurementId]);

  // Either id can load gtag.js (Google Ads alone is enough for conversion measurement); the script is shared.
  const loaderId = measurementId ?? adsId;
  if (excluded || !loaderId) return null;

  const configs = [measurementId, adsId]
    .filter((id): id is string => id !== null)
    .map((id) => `gtag('config', '${id}');`)
    .join(" ");
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${loaderId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs}`}
      </Script>
    </>
  );
}
