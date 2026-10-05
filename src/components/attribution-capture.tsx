"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordTouchFromWindow } from "@/lib/leads/attribution-storage";

/**
 * Remembers how a visitor arrived (campaign parameters, referrer, landing
 * page) in the browser, so it can be attached to an assistance enquiry if
 * they later submit one. Renders nothing, sends nothing on its own — the
 * data only leaves the browser inside a gate submission the visitor makes.
 * Private areas (/admin, /profile) are never recorded.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    recordTouchFromWindow();
  }, [pathname]);

  return null;
}
