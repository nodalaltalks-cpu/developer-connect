"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertKey, alertTitle, newAlerts, patternFor, trimAlerted, type AlertItem } from "@/lib/leads/follow-up-alerts";

/**
 * Strong follow-up alerts for the team workspace. While the app is open (in front or in the background) it checks every 30 seconds, and
 * the moment a follow-up falls due, or is missed, it interrupts: a long vibration pattern, a full-width alert you must acknowledge, and,
 * if you have turned notifications on, a system notification that also vibrates. Each follow-up alerts once per device.
 *
 * Honest limit: this works while the app is open or running in the background. A phone that has fully closed the app cannot be buzzed by
 * a web page; that needs a native alarm or a push service, which are not switched on.
 */

const POLL_MS = 30_000;
const STORAGE_KEY = "dc_alerted_followups";

function readAlerted(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeAlerted(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimAlerted(keys)));
  } catch {
    // storage blocked: the alert may repeat on the next poll, which is the safe direction to fail
  }
}

export function FollowUpAlerts() {
  const [queue, setQueue] = useState<AlertItem[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the notification permission can only be read in the browser, after mount
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    alerted.current = new Set(readAlerted());
  }, []);

  const fire = useCallback(async (item: AlertItem) => {
    try {
      navigator.vibrate?.([...patternFor(item.kind)]);
    } catch {
      // vibration is a nicety; the on-screen alert still shows
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(alertTitle(item), {
          body: item.kind === "MISSED" ? "Clear it to unlock your other leads." : "Tap to open the lead and call.",
          tag: alertKey(item),
          requireInteraction: true,
          vibrate: [...patternFor(item.kind)],
          data: { url: `/team/leads/${item.leadId}` },
        } as NotificationOptions);
      } catch {
        // the on-screen alert is the fallback
      }
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function check() {
      if (document.visibilityState === "visible" || permission === "granted") {
        try {
          const response = await fetch("/api/team/alerts", { cache: "no-store", credentials: "same-origin" });
          if (response.ok) {
            const body = (await response.json()) as { items?: AlertItem[] };
            const fresh = newAlerts(body.items ?? [], alerted.current);
            if (fresh.length > 0) {
              for (const item of fresh) alerted.current.add(alertKey(item));
              writeAlerted([...alerted.current]);
              setQueue((current) => [...current, ...fresh]);
              void fire(fresh[0]);
            }
          }
        } catch {
          // offline or a server hiccup: try again on the next tick
        }
      }
      if (!stopped) timer = setTimeout(check, POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fire, permission]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    try {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }
  }

  const current = queue[0];
  const next = () => setQueue((q) => q.slice(1));

  return (
    <>
      {permission === "default" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          <span className="text-foreground">Get a strong vibration and notification the moment a follow-up is due.</span>
          <button type="button" onClick={enable} className="inline-flex min-h-11 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Turn on alerts
          </button>
        </div>
      )}
      {current && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className={`w-full max-w-md rounded-2xl border-2 bg-background p-5 shadow-2xl ${current.kind === "MISSED" ? "border-red-500" : "border-gold"}`}>
            <p className={`text-xs font-bold uppercase tracking-[0.2em] ${current.kind === "MISSED" ? "text-red-700" : "text-foreground"}`}>{current.kind === "MISSED" ? "Missed follow-up" : "Follow-up due now"}</p>
            <h2 id="alert-title" className="mt-1 font-serif text-2xl font-medium text-foreground">
              {current.name ?? "A lead"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {current.kind === "MISSED" ? "This one is overdue. Until it is cleared, your other leads stay locked." : "It is time to call. Open the lead, call, and record what was said."}
            </p>
            {queue.length > 1 && <p className="mt-2 text-xs text-muted-foreground">{queue.length - 1} more waiting.</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href={`/team/leads/${current.leadId}`} onClick={next} className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
                Open lead
              </Link>
              <button type="button" onClick={next} className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
