"use client";

import { useEffect, useRef, useState } from "react";
import { trackSocial } from "@/lib/social/track-client";
import type { SocialVideo } from "@/lib/social/types";

/**
 * Landing-page video rail: the Founder's best short and long-form videos, vertical (Reels) and horizontal (long-form) side by side,
 * swiped or dragged sideways. Each card plays a muted preview on its own while it is on screen and pauses when it is not (and never
 * autoplays for visitors who ask for reduced motion). Tapping a card opens the post on Instagram (or the video on YouTube).
 * What the visitor does is counted anonymously: seen, played (and for how long), clicked, and swiped.
 */

function VideoCard({ video }: { video: SocialVideo }) {
  const card = useRef<HTMLAnchorElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const playedSince = useRef<number | null>(null);
  const watchedMs = useRef(0);

  useEffect(() => {
    const node = card.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = player.current;

    const flush = () => {
      if (playedSince.current !== null) {
        watchedMs.current += Date.now() - playedSince.current;
        playedSince.current = null;
      }
      if (watchedMs.current > 500) trackSocial({ kind: "video_play", contentId: video.id, platform: video.platform, watchMs: watchedMs.current });
      watchedMs.current = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        if (visible && !seen.current) {
          seen.current = true;
          trackSocial({ kind: "video_impression", contentId: video.id, platform: video.platform });
        }
        if (!el || reduce) return;
        if (visible) {
          void el
            .play()
            .then(() => {
              if (playedSince.current === null) playedSince.current = Date.now();
            })
            .catch(() => {});
        } else {
          el.pause();
          flush();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(node);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        el?.pause();
        flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [video.id, video.platform]);

  const vertical = video.orientation === "VERTICAL";
  return (
    <a
      ref={card}
      href={video.permalinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackSocial({ kind: "video_click", contentId: video.id, platform: video.platform })}
      aria-label={`${video.title}: watch on ${video.platform === "INSTAGRAM" ? "Instagram" : "YouTube"}`}
      className={`group relative block shrink-0 snap-start overflow-hidden rounded-2xl bg-black shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vertical ? "aspect-[9/16] w-44 sm:w-52" : "aspect-video w-72 sm:w-96"}`}
    >
      {video.mediaUrl ? (
        <video ref={player} src={video.mediaUrl} poster={video.posterUrl ?? undefined} muted loop playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
      ) : video.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the Founder's own thumbnail, any host
        <img src={video.posterUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{video.title}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-white/85">
          <span aria-hidden="true" className="inline-block size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
          {video.platform === "INSTAGRAM" ? "Watch on Instagram" : "Watch on YouTube"}
        </p>
      </div>
    </a>
  );
}

export function VideoStrip({ videos, followUrl }: { videos: SocialVideo[]; followUrl: string | null }) {
  const rail = useRef<HTMLDivElement>(null);
  const [swiped, setSwiped] = useState(false);
  if (videos.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  const onScroll = () => {
    if (swiped) return;
    setSwiped(true);
    trackSocial({ kind: "carousel_swipe" });
  };

  return (
    <section aria-labelledby="watch-heading" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Watch</p>
            <h2 id="watch-heading" className="mt-2 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              Property, explained in minutes
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-foreground/75">Our most-watched videos on Mumbai and Dubai real estate. Tap one to watch the full video.</p>
          </div>
          <div className="hidden gap-2 sm:flex">
            <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous videos" className="flex size-11 items-center justify-center rounded-full border border-border text-lg hover:bg-muted">
              ←
            </button>
            <button type="button" onClick={() => scrollBy(1)} aria-label="Next videos" className="flex size-11 items-center justify-center rounded-full border border-border text-lg hover:bg-muted">
              →
            </button>
          </div>
        </div>
        <div ref={rail} onScroll={onScroll} className="-mx-4 mt-6 flex snap-x snap-mandatory items-end gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
        {followUrl && (
          <a href={followUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
            Follow us on Instagram →
          </a>
        )}
      </div>
    </section>
  );
}
