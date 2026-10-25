"use client";

import { useEffect, useRef, useState } from "react";
import { buildSiteShareMessage, buildSiteWhatsAppShareUrl } from "@/lib/share";

/**
 * Share the page the visitor is on: WhatsApp, Copy link, and (where the device offers it) the phone's own share sheet.
 * Lives in the site header because an installed app has no browser menu, so without it there is no way to pass the
 * site on. It shares the exact public URL, never a tracked or shortened one, and collects nothing.
 */
export function SiteShare() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const url = () => window.location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: say nothing rather than show a false "Copied".
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "Developer Connects", text: buildSiteShareMessage(url()), url: url() });
      setOpen(false);
    } catch {
      // The visitor closed the share sheet: not an error.
    }
  }

  const item = "flex min-h-11 w-full items-center px-4 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          // Only knowable in the browser, so it is read on the tap rather than during render.
          setCanNativeShare(typeof navigator.share === "function");
          setOpen((o) => !o);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Share this page"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-foreground hover:bg-muted hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
        </svg>
        <span className="hidden sm:inline">Share</span>
      </button>
      {open && (
        <div role="menu" aria-label="Share this page" className="absolute right-0 top-12 z-40 w-56 rounded-lg border border-border bg-background py-1.5 shadow-lg">
          <a role="menuitem" href={typeof window === "undefined" ? "#" : buildSiteWhatsAppShareUrl(url())} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            Share on WhatsApp
          </a>
          <button type="button" role="menuitem" onClick={copy} className={item}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {canNativeShare && (
            <button type="button" role="menuitem" onClick={nativeShare} className={item}>
              More apps…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
