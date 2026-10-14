"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertsMessage, enableAlerts, useAlertsState } from "@/components/team/alerts-control";
import { alertKey, alertTitle, catchUpAlerts, newAlerts, patternFor, trimAlerted, type AlertItem } from "@/lib/leads/follow-up-alerts";

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
// What the person has opened or dismissed. Anything due or missed and NOT in here buzzes again the next time the app is opened.
const ACK_KEY = "dc_acknowledged_followups";
const AWAY_MS = 20_000;

function readAlerted(key: string = STORAGE_KEY): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeAlerted(keys: string[], key: string = STORAGE_KEY) {
  try {
    window.localStorage.setItem(key, JSON.stringify(trimAlerted(keys)));
  } catch {
    // storage blocked: the alert may repeat on the next poll, which is the safe direction to fail
  }
}

export function FollowUpAlerts({ showBanner = true }: { showBanner?: boolean } = {}) {
  const [queue, setQueue] = useState<AlertItem[]>([]);
  // How many reminders were waiting when the app was opened again (shown as "While you were away").
  const [awayCount, setAwayCount] = useState(0);
  const acknowledged = useRef<Set<string>>(new Set());
  const { permission, busy } = useAlertsState();
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    alerted.current = new Set(readAlerted());
    acknowledged.current = new Set(readAlerted(ACK_KEY));
  }, []);

  const fire = useCallback(async (item: AlertItem, waiting = 1) => {
    try {
      navigator.vibrate?.([...patternFor(item.kind)]);
    } catch {
      // vibration is a nicety; the on-screen alert still shows
    }
    const summary = waiting > 1;
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(summary ? `${waiting} follow-ups are waiting for you` : alertTitle(item), {
          body: summary ? `First: ${item.name ?? "a lead"}. Tap to open it and call.` : item.kind === "MISSED" ? "Clear it to unlock your other leads." : "Tap to open the lead and call.",
          tag: summary ? "dc-follow-ups-waiting" : alertKey(item),
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

    async function check(catchUp = false) {
      if (document.visibilityState === "visible" || permission === "granted") {
        try {
          const response = await fetch("/api/team/alerts", { cache: "no-store", credentials: "same-origin" });
          if (response.ok) {
            const body = (await response.json()) as { items?: AlertItem[] };
            const items = body.items ?? [];
            // Opening the app again: EVERYTHING still waiting buzzes, including reminders that came while the phone or Chrome was off.
            const fresh = catchUp ? catchUpAlerts(items, acknowledged.current) : newAlerts(items, alerted.current);
            if (fresh.length > 0) {
              for (const item of fresh) alerted.current.add(alertKey(item));
              writeAlerted([...alerted.current]);
              setQueue((current) => {
                const have = new Set(current.map(alertKey));
                return [...current, ...fresh.filter((item) => !have.has(alertKey(item)))];
              });
              if (catchUp) setAwayCount(fresh.length);
              void fire(fresh[0], catchUp ? fresh.length : 1);
            }
          }
        } catch {
          // offline or a server hiccup: try again on the next tick
        }
      }
      if (!stopped) timer = setTimeout(() => void check(), POLL_MS);
    }

    let hiddenAt: number | null = null;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS;
      hiddenAt = null;
      if (timer) clearTimeout(timer);
      void check(away);
    };
    document.addEventListener("visibilitychange", onVisible);
    void check(true); // a fresh open is a return too
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fire, permission]);

  const current = queue[0];
  // Opening or dismissing an alert is the acknowledgement: only then does it stop coming back when the app is opened.
  const next = () =>
    setQueue((q) => {
      if (q[0]) {
        acknowledged.current.add(alertKey(q[0]));
        writeAlerted([...acknowledged.current], ACK_KEY);
      }
      if (q.length <= 1) setAwayCount(0);
      return q.slice(1);
    });

  return (
    <>
      {showBanner && permission !== "granted" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-3 text-sm">
          <span className="min-w-0 flex-1 font-medium text-foreground">
            {permission === "denied" ? "Alerts are blocked on this phone, so you will not be buzzed when a follow-up is due." : "Get a strong vibration and notification the moment a follow-up is due."}
          </span>
          <button type="button" onClick={enableAlerts} disabled={busy} className="inline-flex min-h-12 items-center rounded-md bg-amber-400 px-4 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-60">
            {busy ? "Turning on…" : permission === "denied" ? "How to unblock" : "Turn on alerts"}
          </button>
        </div>
      )}
      {showBanner && <AlertsMessage />}
      {current && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className={`w-full max-w-md rounded-2xl border-2 bg-background p-5 shadow-2xl ${current.kind === "MISSED" ? "border-red-500" : "border-gold"}`}>
            {awayCount > 0 && (
              <p className="mb-2 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white">
                While you were away: {awayCount} follow-up{awayCount === 1 ? " is" : "s are"} waiting for you.
              </p>
            )}
            <p className={`text-xs font-bold uppercase tracking-[0.2em] ${current.kind === "MISSED" ? "text-red-700" : "text-foreground"}`}>{current.kind === "MISSED" ? "Missed follow-up" : "Follow-up due now"}</p>
            <h2 id="alert-title" className="mt-1 font-serif text-2xl font-medium text-foreground">
              {current.name ?? "A lead"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {current.kind === "MISSED" ? "This lead is missed. Until it is cleared, your other leads stay locked." : "It is time to call. Open the lead, call, and record what was said."}
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
