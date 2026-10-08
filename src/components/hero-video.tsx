"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cinematic background for the homepage hero. Purely decorative (aria-hidden, muted, no controls).
 *
 * Footage: free stock clips from Pexels (Pexels License: free for commercial use, no attribution required),
 * stored in /public/video. A portrait cut is used on phones and a landscape cut from tablet width up.
 *
 * It is deliberately polite: the page paints first on a dark gradient, the video is only fetched afterwards, and it never
 * loads for a visitor who asked for reduced motion, turned on Data Saver, or is on a slow connection (they simply keep
 * the gradient). It pauses when scrolled out of view or when the tab is hidden, and any failure leaves the gradient.
 */
const SOURCES = {
  wide: "/video/hero-landscape.mp4",
  tall: "/video/hero-portrait-sm.mp4",
} as const;

type SaveDataConnection = { saveData?: boolean; effectiveType?: string };

function mayPlayVideo(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const connection = (navigator as Navigator & { connection?: SaveDataConnection }).connection;
    if (connection?.saveData) return false;
    if (connection?.effectiveType && /^(slow-2g|2g|3g)$/.test(connection.effectiveType)) return false;
  } catch {
    // unknown environment: fall through and try
  }
  return true;
}

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mayPlayVideo()) return;

    let cancelled = false;
    let started = false;
    let observer: IntersectionObserver | undefined;

    const start = () => {
      if (cancelled || started) return;
      started = true;
      video.src = window.matchMedia("(min-width: 768px)").matches ? SOURCES.wide : SOURCES.tall;
      video.muted = true;
      video.play().then(
        () => {
          if (!cancelled) setPlaying(true);
        },
        () => {
          // autoplay refused: keep the gradient
        },
      );
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && document.visibilityState === "visible") void video.play().catch(() => {});
        else video.pause();
      });
      observer.observe(video);
    };

    // Wait for the page to be loaded and visible, then give it a moment, before spending any bandwidth on the video.
    // A plain timer (not requestIdleCallback, which browsers may never run in a background tab) after load; a tab that is
    // hidden at that point simply waits until someone looks at it.
    let timer: number | undefined;
    const schedule = () => {
      if (cancelled || started) return;
      if (document.visibilityState !== "visible") return; // onVisibility reschedules
      window.clearTimeout(timer);
      timer = window.setTimeout(start, 1000);
    };
    const begin = () => schedule();
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });

    const onVisibility = () => {
      if (!started) {
        schedule();
        return;
      }
      if (document.visibilityState === "hidden") video.pause();
      else void video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("load", begin);
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,92,160,0.35),transparent_60%),linear-gradient(to_bottom,#0b1220,#0f172a)]" />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        tabIndex={-1}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ${playing ? "opacity-70" : "opacity-0"}`}
      />
      {/* Contrast scrims keep the headline readable on any frame of the footage. */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/35 to-slate-950/85" />
    </div>
  );
}
