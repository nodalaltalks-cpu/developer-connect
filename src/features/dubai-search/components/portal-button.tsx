"use client";

import { track } from "../lib/analytics.ts";
import type { PortalLink } from "../lib/portals.ts";

declare global {
  interface Window {
    gtag?: (command: "event", name: string, params: Record<string, string>) => void;
  }
}

/**
 * A button that opens one portal's own search results in a new tab. The click is counted in this browser's local log and, when the
 * site's existing Google Analytics is present, as one "portal_click" event (portal name and page only, nothing personal).
 */
export function PortalButton({ link, page, primary = true }: { link: PortalLink; page: string; primary?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => {
        track("source_outbound_click", link.id);
        try {
          window.gtag?.("event", "portal_click", { portal: link.id, page });
        } catch {
          // Analytics is optional.
        }
      }}
      className={`group flex min-h-14 flex-col justify-center rounded-xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 ${primary ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700" : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"}`}
    >
      <span className="text-sm font-semibold">{link.name} ↗</span>
      <span className={`text-xs ${primary ? "text-white/75" : "text-neutral-600"}`}>{link.detail}</span>
    </a>
  );
}
