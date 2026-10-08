"use client";

import { useEffect, useRef, useState } from "react";
import { useHeroMarket } from "@/components/hero-market";
import { MARKETS, type Market } from "@/lib/hero-market";

/**
 * Cinematic background for the homepage hero: one film per city (Dubai, Mumbai), cross-fading when the visitor switches.
 * Purely decorative (aria-hidden, muted, no controls).
 *
 * Footage: free stock clips from Pexels (Pexels License: free for commercial use, no attribution required), re-encoded
 * to short loops in /public/video. Each city has three cuts, chosen per device:
 *   - phones (portrait screens): 720x1280, a few MB
 *   - desktops and tablets: 1920x1080
 *   - large screens on a fast connection: 2560x1440 (the ultra-sharp cut)
 * Full 4K is deliberately not used: for a background it adds tens of megabytes for no visible gain.
 *
 * It is polite: the page paints first on a dark gradient; the film is only fetched once the page has loaded and the tab is
 * visible; it never loads for a visitor who asked for reduced motion, turned on Data Saver, or is on a slow connection
 * (they keep the gradient); only the chosen city's film downloads (the other one starts loading when the visitor reaches
 * for its button); it pauses when scrolled out of view or when the tab is hidden; any failure leaves the gradient.
 */
type Connection = { saveData?: boolean; effectiveType?: string };

function mayPlayVideo(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    if (connection?.saveData) return false;
    if (connection?.effectiveType && /^(slow-2g|2g|3g)$/.test(connection.effectiveType)) return false;
  } catch {
    // unknown environment: fall through and try
  }
  return true;
}

function sourceFor(market: Market): string {
  const portrait = window.matchMedia("(max-width: 767px)").matches;
  if (portrait) return `/video/${market}-tall-720.mp4`;
  const nav = navigator as Navigator & { connection?: Connection; deviceMemory?: number };
  const fast = nav.connection?.effectiveType === "4g" && !nav.connection?.saveData && (nav.deviceMemory === undefined || nav.deviceMemory >= 4);
  const large = window.innerWidth >= 1800 || window.screen.width * (window.devicePixelRatio || 1) >= 2560;
  return `/video/${market}-wide-${fast && large ? "1440" : "1080"}.mp4`;
}

const TINT: Record<Market, string> = {
  dubai: "bg-[radial-gradient(ellipse_at_top,rgba(56,92,160,0.38),transparent_60%),linear-gradient(to_bottom,#0b1220,#0f172a)]",
  mumbai: "bg-[radial-gradient(ellipse_at_top,rgba(20,120,140,0.38),transparent_60%),linear-gradient(to_bottom,#0a1519,#0f1d24)]",
};

export function HeroVideo() {
  const { market, warm } = useHeroMarket();
  const refs = useRef<Record<Market, HTMLVideoElement | null>>({ dubai: null, mumbai: null });
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState<Record<Market, boolean>>({ dubai: false, mumbai: false });
  const marketRef = useRef(market);
  marketRef.current = market;

  // 1. Decide once whether video may run at all, and when (after load, tab visible, a moment of calm).
  useEffect(() => {
    if (!mayPlayVideo()) return;
    let cancelled = false;
    let done = false;
    let timer: number | undefined;
    const go = () => {
      if (cancelled || done) return;
      done = true;
      setAllowed(true);
    };
    const schedule = () => {
      if (cancelled || done || document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(go, 1000);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("load", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);

  // 2. Load the chosen city's film (and, once the visitor reaches for the other button, that one) and play the chosen one.
  useEffect(() => {
    if (!allowed) return;
    const load = (m: Market) => {
      const el = refs.current[m];
      if (el && !el.getAttribute("src")) {
        el.src = sourceFor(m);
        el.load();
      }
    };
    load(market);
    if (warm) load(warm);
    void refs.current[market]?.play().catch(() => {});
    // The film that is no longer chosen stops once the cross-fade has finished.
    const stop = window.setTimeout(() => {
      for (const m of MARKETS) if (m !== marketRef.current) refs.current[m]?.pause();
    }, 1700);
    return () => window.clearTimeout(stop);
  }, [allowed, market, warm]);

  // 3. Save battery: pause when scrolled out of view or when the tab is hidden.
  useEffect(() => {
    if (!allowed) return;
    const chosen = () => refs.current[marketRef.current];
    const observer = new IntersectionObserver(([entry]) => {
      const el = chosen();
      if (!el) return;
      if (entry.isIntersecting && document.visibilityState === "visible") void el.play().catch(() => {});
      else el.pause();
    });
    const root = refs.current[market];
    if (root) observer.observe(root);
    const onVisibility = () => {
      const el = chosen();
      if (!el) return;
      if (document.visibilityState === "hidden") el.pause();
      else void el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [allowed, market]);

  // A film is shown only once it is really playing; until then the previous one (or the gradient) stays.
  const other: Market = market === "dubai" ? "mumbai" : "dubai";
  const shown: Market | null = ready[market] ? market : ready[other] ? other : null;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-slate-950">
      {MARKETS.map((m) => (
        <div key={`tint-${m}`} className={`absolute inset-0 transition-opacity duration-[1200ms] ${TINT[m]} ${market === m ? "opacity-100" : "opacity-0"}`} />
      ))}
      {MARKETS.map((m) => (
        <video
          key={m}
          ref={(el) => {
            refs.current[m] = el;
          }}
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
          onPlaying={() => setReady((r) => (r[m] ? r : { ...r, [m]: true }))}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ${shown === m ? "opacity-70" : "opacity-0"}`}
        />
      ))}
      {/* Contrast scrims keep the headline readable on any frame of the footage. */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/35 to-slate-950/85" />
    </div>
  );
}
