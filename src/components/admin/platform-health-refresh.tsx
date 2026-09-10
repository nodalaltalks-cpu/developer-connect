"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/platform-health/format";
import { buttonClassName } from "@/components/ui/button";

/**
 * "Last checked: X ago" + a Refresh button. Refresh re-runs the Server
 * Component (router.refresh()) to get genuinely fresh server-side
 * measurements — no client-side polling, no WebSockets, matching the
 * existing "server revalidation over fake real-time" pattern used
 * elsewhere in this admin dashboard.
 */
export function PlatformHealthRefresh({ checkedAt }: { checkedAt: string }) {
  const [, forceTick] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-muted-foreground">
        Last checked: {formatRelativeTime(new Date(checkedAt))}
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className={buttonClassName("secondary", "min-h-9 px-4 py-1.5 text-xs")}
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
