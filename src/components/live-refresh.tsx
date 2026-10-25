"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a private page current without a manual reload. It asks /api/live for one number (the newest event position this person
 * may see) and, only when that number moved, re-renders the page's server data with router.refresh(). Nothing is painted from the
 * poll itself, so what is on screen is always what the server computed.
 *
 *  - It polls only while the tab is visible and the device is online, checks immediately when the tab comes back, and backs off
 *    after errors, so an idle or backgrounded tab costs nothing.
 *  - It never refreshes while the person is typing in a field on the page (their half-written note is not thrown away).
 *  - It stops after IDLE_MS with no mouse, keyboard, touch or scroll, and picks up again the moment the person is back. A page
 *    left open on a desk therefore costs the database nothing: it can go to sleep instead of being kept awake all day.
 */

const BASE_MS = 15_000;
const MAX_MS = 60_000;
const IDLE_MS = 5 * 60_000;

function isTyping() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

export function LiveRefresh({ intervalMs = BASE_MS }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [live, setLive] = useState<"live" | "paused">("live");
  const cursor = useRef<number | null>(null);
  const waiting = useRef(false);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = intervalMs;
    let stopped = false;
    let lastActivity = Date.now();
    let idle = false;

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(tick, delay);
    };

    async function tick() {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        setLive("paused");
        schedule();
        return;
      }
      if (Date.now() - lastActivity > IDLE_MS) {
        // Nobody has touched this page for a while: stop asking the server until they do.
        idle = true;
        setLive("paused");
        return;
      }
      try {
        const response = await fetch("/api/live", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const { cursor: next } = (await response.json()) as { cursor: number };
        delay = intervalMs;
        setLive("live");
        if (cursor.current === null) cursor.current = next;
        else if (next !== cursor.current) {
          if (isTyping() || pendingRef.current) waiting.current = true;
          else {
            waiting.current = false;
            cursor.current = next;
            startTransition(() => router.refresh());
          }
        } else if (waiting.current && !isTyping() && !pendingRef.current) {
          waiting.current = false;
          startTransition(() => router.refresh());
        }
      } catch {
        delay = Math.min(delay * 2, MAX_MS);
        setLive("paused");
      }
      schedule();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };
    const onActivity = () => {
      lastActivity = Date.now();
      if (idle) {
        idle = false;
        if (timer) clearTimeout(timer);
        void tick();
      }
    };
    const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [intervalMs, router]);

  return (
    <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="off">
      <span aria-hidden className={`inline-block size-2 rounded-full ${live === "live" ? "bg-green-500" : "bg-muted-foreground"}`} />
      {live === "live" ? "Live: updates appear on their own" : "Updates paused"}
    </p>
  );
}
