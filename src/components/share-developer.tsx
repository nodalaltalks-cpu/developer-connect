"use client";

import { useEffect, useRef, useState } from "react";
import { recordDeveloperShare } from "@/app/_actions/public-actions";
import { buildShareMessage, buildWhatsAppShareUrl, buildMailtoShareUrl } from "@/lib/share";

function currentUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

/**
 * Checked only inside click handlers (never during render) so this never
 * needs client/server state-syncing — `navigator.share` genuinely isn't
 * knowable at render time (SSR has no `navigator`), but a click only ever
 * happens after hydration, so there's nothing to reconcile.
 */
function supportsNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Sharing for a public developer page (Parts 28-32). Always shares the
 * exact current public URL — never a shortened/tracked link, never
 * collects a phone number or email address. On devices with the Web
 * Share API, one tap goes straight to the native sheet; everywhere else,
 * "Share" opens a small menu with WhatsApp/Email/Copy link rather than
 * showing all three as separate buttons.
 */
export function ShareDeveloper({
  developerId,
  developerName,
}: {
  developerId: string;
  developerName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleShareClick() {
    if (supportsNativeShare()) {
      const url = currentUrl();
      try {
        await navigator.share({ title: developerName, text: buildShareMessage(developerName, url), url });
        void recordDeveloperShare(developerId, "native_share");
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
      return;
    }
    setMenuOpen((open) => !open);
  }

  function handleWhatsApp() {
    window.open(buildWhatsAppShareUrl(developerName, currentUrl()), "_blank", "noopener,noreferrer");
    void recordDeveloperShare(developerId, "whatsapp");
    setMenuOpen(false);
  }

  function handleEmail() {
    window.location.href = buildMailtoShareUrl(developerName, currentUrl());
    void recordDeveloperShare(developerId, "email");
    setMenuOpen(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      void recordDeveloperShare(developerId, "copy_link");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access blocked (permissions/insecure context) — fail
      // quietly rather than showing a broken "Copied" state.
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={handleShareClick}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        className="flex min-h-11 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
        </svg>
        Share
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Share this developer"
          className="absolute left-0 top-12 z-20 w-56 rounded-lg border border-border bg-background py-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleWhatsApp}
            className="flex min-h-11 w-full items-center px-4 text-left text-sm text-foreground hover:bg-muted"
          >
            WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleEmail}
            className="flex min-h-11 w-full items-center px-4 text-left text-sm text-foreground hover:bg-muted"
          >
            Email
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex min-h-11 w-full items-center px-4 text-left text-sm text-foreground hover:bg-muted"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
