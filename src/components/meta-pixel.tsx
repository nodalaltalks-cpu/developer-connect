"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { isAnalyticsExcludedPath } from "@/lib/analytics-config";

/**
 * The Meta Pixel. Rendered by the consent provider ONLY when a valid pixel id is configured AND the visitor pressed "Accept";
 * never on a private page. Page views after the first come from our own page-change tracking (analytics-events.tsx), so the
 * base snippet below deliberately does not auto-track history changes.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  if (isAnalyticsExcludedPath(pathname)) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');`}
    </Script>
  );
}
