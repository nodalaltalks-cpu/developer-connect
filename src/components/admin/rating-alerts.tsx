"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The Founder's rating pop-up. While a Founder page is open and visible it asks /api/alerts/ratings every 8 seconds whether a buyer
 * has rated the service since it last looked, and shows a card for each new one (who, how many stars, what they wrote) with a link to
 * the ratings page. Cards fade after 15 seconds and never stack more than three. The "since" moment is kept in the Founder's own
 * browser so a reload does not repeat an alert they have already seen.
 */

const POLL_MS = 8_000;
const SHOW_MS = 15_000;
const SEEN_KEY = "dc_rating_alert_since";

interface AlertItem {
  id: string;
  stars: number;
  name: string;
  title: string;
  comment: string | null;
  ratedAt: string;
}

function readSince(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSince(value: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    // storage blocked: alerts still work for this visit
  }
}

export function RatingAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    let stopped = false;
    let since = readSince();

    async function tick() {
      if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const url = since ? `/api/alerts/ratings?since=${encodeURIComponent(since)}` : "/api/alerts/ratings";
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const data = (await response.json()) as { now: string; items: AlertItem[] };
        const fresh = data.items.filter((i) => !shown.current.has(i.id));
        // Only advance past what has been delivered: the newest rating's own time, or the server's clock when there is none.
        const newest = data.items.length ? data.items[data.items.length - 1].ratedAt : data.now;
        since = newest;
        writeSince(newest);
        if (fresh.length === 0) return;
        for (const item of fresh) shown.current.add(item.id);
        setAlerts((current) => [...current, ...fresh].slice(-3));
        for (const item of fresh) {
          setTimeout(() => setAlerts((current) => current.filter((a) => a.id !== item.id)), SHOW_MS);
        }
      } catch {
        // try again on the next beat
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-5" aria-live="polite" role="status">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-gold/70 bg-ink p-4 text-pearl shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-white">
              <span aria-hidden="true" className="mr-1 tracking-wide text-brass-300">
                {"★".repeat(a.stars)}
                {"☆".repeat(5 - a.stars)}
              </span>
              <span className="sr-only">{a.stars} out of 5 stars, </span>
              {a.name} rated the service
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setAlerts((current) => current.filter((x) => x.id !== a.id))}
              className="-m-2 flex size-9 shrink-0 items-center justify-center rounded-md text-mist hover:text-white"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <p className="mt-1 text-xs text-mist">{a.title}</p>
          {a.comment && <p className="mt-2 text-sm text-pearl">&ldquo;{a.comment}&rdquo;</p>}
          <Link href="/admin/ratings" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-brass-300 hover:underline">
            See all ratings →
          </Link>
        </div>
      ))}
    </div>
  );
}
