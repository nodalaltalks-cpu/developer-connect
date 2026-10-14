"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlertsState } from "@/components/team/alerts-control";
import { alertHeadline, bannerText, newLeadKey, NEW_LEAD_REPEAT_MS, NEW_LEAD_VIBRATION, unseenNewLeads, type NewLeadItem } from "@/lib/leads/new-lead-alert";

/**
 * New enquiries, impossible to miss. While a buyer's enquiry is still NEW (nobody has contacted them) two things are on screen:
 *
 *  1. A red banner on every screen of the workspace that stays until the lead is contacted (it is not dismissable: it is a task).
 *  2. A pop-up the first time this device sees that enquiry, with a long vibration that repeats until the pop-up is opened or dismissed,
 *     and, if notifications are on, a system notification that also vibrates (so it reaches a phone that is in the pocket).
 *
 * Honest limits: a web page can only vibrate a phone while the app is open or in the background and after the person has touched the
 * screen at least once since opening it; a fully closed app needs a push service. The banner and pop-up wait for the next open.
 */

const POLL_VISIBLE_MS = 10_000;
const POLL_HIDDEN_MS = 30_000;
const SEEN_KEY = "dc_seen_new_leads";

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeSeen(keys: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-300)));
  } catch {
    // storage blocked: an enquiry may pop up again on the next open, which is the safe direction
  }
}

export function NewLeadAlerts() {
  const [pending, setPending] = useState<{ total: number; items: NewLeadItem[] }>({ total: 0, items: [] });
  const [queue, setQueue] = useState<NewLeadItem[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const { permission } = useAlertsState();

  useEffect(() => {
    seen.current = new Set(readSeen());
  }, []);

  const notify = useCallback(async (item: NewLeadItem, waiting: number) => {
    try {
      navigator.vibrate?.([...NEW_LEAD_VIBRATION]);
    } catch {
      // the pop-up still shows
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(waiting > 1 ? `${waiting} new enquiries are waiting` : alertHeadline(item), {
          body: "Contact the buyer as soon as possible. Tap to open.",
          tag: waiting > 1 ? "dc-new-enquiries" : newLeadKey(item),
          requireInteraction: true,
          vibrate: [...NEW_LEAD_VIBRATION],
          data: { url: item.href },
        } as NotificationOptions);
      } catch {
        // the on-screen pop-up is the fallback
      }
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function check() {
      const visible = document.visibilityState === "visible";
      if (visible || permission === "granted") {
        try {
          const response = await fetch("/api/alerts/new-leads", { cache: "no-store", credentials: "same-origin" });
          if (response.ok) {
            const body = (await response.json()) as { total: number; items: NewLeadItem[] };
            setPending({ total: body.total, items: body.items });
            const fresh = unseenNewLeads(body.items, seen.current);
            if (fresh.length > 0) {
              setQueue((current) => {
                const have = new Set(current.map((i) => i.id));
                return [...current, ...fresh.filter((i) => !have.has(i.id))];
              });
              void notify(fresh[0], fresh.length);
            }
          }
        } catch {
          // offline or a server hiccup: the next tick tries again
        }
      }
      if (!stopped) timer = setTimeout(() => void check(), document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
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
  }, [notify, permission]);

  // The vibration repeats while a pop-up is waiting to be dealt with.
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      try {
        navigator.vibrate?.([...NEW_LEAD_VIBRATION]);
      } catch {
        // optional
      }
    }, NEW_LEAD_REPEAT_MS);
    return () => clearInterval(timer);
  }, [current]);

  const acknowledge = () =>
    setQueue((q) => {
      if (q[0]) {
        seen.current.add(newLeadKey(q[0]));
        writeSeen([...seen.current]);
      }
      return q.slice(1);
    });

  const first = pending.items[0];

  return (
    <>
      {pending.total > 0 && (
        <div role="alert" className="sticky top-0 z-40 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-red-700 bg-red-600 px-3 py-3 text-white shadow-lg">
          <span className="min-w-0 flex-1 text-sm font-bold">
            <span aria-hidden="true" className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-white" />
            {bannerText(pending.total)}
          </span>
          {first && (
            <Link href={first.href} className="inline-flex min-h-11 items-center rounded-md bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50">
              Contact now
            </Link>
          )}
        </div>
      )}

      {current && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="new-lead-title" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border-4 border-red-600 bg-background p-5 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">New enquiry · contact as soon as possible</p>
            <h2 id="new-lead-title" className="mt-1 font-serif text-2xl font-medium text-foreground">
              {alertHeadline(current)}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">A buyer has just shared their number. The sooner you call or WhatsApp, the better the chance of a conversation.</p>
            {queue.length > 1 && <p className="mt-2 text-xs font-semibold text-red-700">{queue.length - 1} more waiting.</p>}
            {permission !== "granted" && permission !== "unsupported" && (
              <p className="mt-2 text-xs text-muted-foreground">Turn on alerts in the header to be buzzed even when this screen is off.</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href={current.href} onClick={acknowledge} className="inline-flex min-h-12 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700">
                Open and contact
              </Link>
              <button type="button" onClick={acknowledge} className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
