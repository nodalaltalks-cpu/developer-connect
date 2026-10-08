"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CTA_EVENTS, marketOfPath, pageTypeOfPath } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/client";

/**
 * Turns what visitors do into the analytics events in lib/analytics/events.ts: a page view per page, developer / directory /
 * search events, and one event for each tracked button (the same data-cta ids the first-party tracker uses). Everything goes through
 * trackEvent, which sends only allow-listed, non-personal parameters and only with consent. Renders nothing.
 */
export function AnalyticsEvents() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const base = { page_type: pageTypeOfPath(pathname), market: marketOfPath(pathname) };
    trackEvent("page_view", base);
    if (pathname.startsWith("/developers/")) {
      trackEvent("developer_view", { ...base, developer_slug: pathname.split("/")[2] });
    } else if (pathname === "/developers") {
      trackEvent("view_item_list", { ...base, item_list_name: "developers" });
      // Whether a search was made, never what was typed.
      if (new URLSearchParams(window.location.search).has("q")) trackEvent("search", base);
    }
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-cta]") : null;
      const id = target?.getAttribute("data-cta");
      const mapped = id ? CTA_EVENTS[id] : undefined;
      if (!mapped) return;
      const path = window.location.pathname;
      trackEvent(mapped.event, { cta: id ?? undefined, channel: mapped.channel, page_type: pageTypeOfPath(path), market: marketOfPath(path) });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
