"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/platform-health/format";
import { buttonClassName } from "@/components/ui/button";

/**
 * Keeps Platform Health real-time. Every `intervalMs` it re-runs the server component (router.refresh()) so the numbers on
 * screen are always fresh server-side measurements, nothing is painted from the timer itself.
 *
 *  - It only runs while the tab is visible and the device is online, and checks again the moment the tab comes back.
 *  - It stops after IDLE_MS with no mouse, keyboard, touch or scroll and resumes on the next one, so a page left open on a
 *    desk does not keep the database busy all day (each refresh is a handful of small reads on the free plan).
 */
const IDLE_MS = 2 * 60_000;

export function PlatformHealthAutoRefresh({ intervalMs = 600_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef(isPending);
  const [live, setLive] = useState<"live" | "paused">("live");
  useEffect(() => {
    pendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastActivity = Date.now();
    let idle = false;

    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    const tick = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        setLive("paused");
        schedule();
        return;
      }
      if (Date.now() - lastActivity > IDLE_MS) {
        idle = true;
        setLive("paused");
        return;
      }
      setLive("live");
      if (!pendingRef.current) startTransition(() => router.refresh());
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    const onActivity = () => {
      lastActivity = Date.now();
      if (idle) {
        idle = false;
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    const EVENTS = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    for (const name of EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const name of EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [intervalMs, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="off">
      <span aria-hidden className={`inline-block size-2 rounded-full ${live === "live" ? "bg-green-500" : "bg-muted-foreground"}`} />
      {live === "live" ? `Live: checks again every ${Math.round(intervalMs / 1000)}s` : "Paused (tab hidden or idle)"}
    </span>
  );
}

/** "Last checked: X ago" + auto-refresh + a manual Refresh button. */
export function PlatformHealthRefresh({ checkedAt }: { checkedAt: string }) {
  const [, forceTick] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PlatformHealthAutoRefresh intervalMs={600_000} />
      <p className="text-sm text-muted-foreground">Last checked: {formatRelativeTime(new Date(checkedAt))}</p>
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
