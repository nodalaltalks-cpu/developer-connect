"use client";

import { useEffect, useRef } from "react";
import { recordDeveloperPageView } from "@/app/_actions/public-actions";

interface DeveloperPageViewTrackerProps {
  developerId: string;
  referrerQuery?: string;
}

/** Fires developer_page_viewed exactly once per mount. Renders nothing. */
export function DeveloperPageViewTracker({
  developerId,
  referrerQuery,
}: DeveloperPageViewTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void recordDeveloperPageView(developerId, referrerQuery);
  }, [developerId, referrerQuery]);

  return null;
}
