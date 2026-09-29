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
 * Page views after the first are recorded by GA4's built-in "page changes
 * based on browser history events" measurement, so no manual page_view
 * calls are needed for App Router navigation.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const excluded = isAnalyticsExcludedPath(pathname);

  useEffect(() => {
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = excluded;
  }, [excluded, measurementId]);

  if (excluded) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`}
      </Script>
    </>
  );
}
