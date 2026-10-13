"use client";

import { useEffect, useRef, useState } from "react";
import { useHeroMarket } from "@/components/hero-market";
import { MARKETS, cutFor, type HeroConnection, type Market } from "@/lib/hero-market";

/**
 * Cinematic background for the homepage hero: one night-skyline film per city, cross-fading when the visitor switches.
 *   - Mumbai: a lit cable-stayed sea bridge over the water at night.
 *   - Dubai: the Burj Khalifa and the Downtown waterfront at night.
 * Purely decorative (aria-hidden, muted, no controls).
 *
 * Footage: free stock clips from Pexels (Pexels License: free for commercial use, no attribution required), shot in 4K and
 * re-encoded to short loops in /public/video. Each city has a sharp still (shown the instant the page opens, so the skyline is
 * never missing while the film loads) and several cuts, chosen per screen and connection:
 *   - phones (portrait screens): 1080x1920
 *   - slow connections: 1280x720, so the film still arrives in seconds
 *   - desktops and tablets: 1920x1080
 *   - large screens: 2560x1440
 *   - 4K screens on a fast connection: 3840x2160 (the full-resolution cut)
 *
 * It is polite: the page paints first with the still; the film is only fetched once the page has loaded and the tab is
 * visible; it never loads for a visitor who asked for reduced motion, turned on Data Saver, or is on a very slow connection
 * (they keep the still); only the chosen city's film downloads (the other one starts loading when the visitor reaches for its
 * button); it pauses when scrolled out of view or when the tab is hidden; any failure leaves the still.
 */
type Connection = HeroConnection;

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
  const nav = navigator as Navigator & { connection?: Connection };
  const portrait = window.matchMedia("(max-width: 767px)").matches;
  const pixelWidth = Math.max(window.innerWidth, window.screen.width) * (window.devicePixelRatio || 1);
  return `/video/${market}-${cutFor({ portrait, pixelWidth }, nav.connection)}.mp4`;
}

export function HeroVideo() {
  const { market, warm } = useHeroMarket();
  const refs = useRef<Record<Market, HTMLVideoElement | null>>({ dubai: null, mumbai: null });
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState<Record<Market, boolean>>({ dubai: false, mumbai: false });
  const marketRef = useRef(market);
  useEffect(() => {
    marketRef.current = market;
  }, [market]);

  // 1. Decide once whether video may run at all, and when (after load, tab visible, a short moment of calm).
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
      timer = window.setTimeout(go, 300);
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

  // A film is shown only once it is really playing; until then the chosen city's still shows (never the other city's film).
  const shown: Market | null = ready[market] ? market : null;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-ink">
      {/* The still: the chosen city's skyline, painted with the page. The other city's still loads only once it is chosen. */}
      {MARKETS.map((m) => (
        <picture key={`still-${m}`} className={`absolute inset-0 transition-opacity duration-[1200ms] ${market === m ? "opacity-100" : "opacity-0"}`}>
          {(market === m || warm === m) && (
            <>
              <source type="image/avif" media="(max-width: 767px)" srcSet={`/video/${m}-still-tall.avif`} />
              <source type="image/avif" srcSet={`/video/${m}-still-1920.avif 1920w, /video/${m}-still-3840.avif 3840w`} sizes="100vw" />
              {/* eslint-disable-next-line @next/next/no-img-element -- stills are pre-encoded (AVIF + JPEG) at exact sizes; no optimiser round trip on the hero */}
              <img
                src={`/video/${m}-still-1920.jpg`}
                alt=""
                fetchPriority={market === m ? "high" : "low"}
                decoding="async"
                className="h-full w-full object-cover"
              />
            </>
          )}
        </picture>
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
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ${shown === m ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      {/* Contrast scrims keep the headline readable on any frame, while the city lights still glow through. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/25 to-ink/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(11,18,32,0.45)_100%)]" />
    </div>
  );
}
