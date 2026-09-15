"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@clerk/nextjs";
import { buttonClassName } from "@/components/ui/button";
import { OFFICIAL_WEBSITE_CLICK_EVENT } from "@/lib/login-conversion";

const SHOWN_KEY = "dc_login_prompt_shown";
const CLICK_COUNT_KEY = "dc_official_site_clicks";
const TIME_TRIGGER_MS = 60_000;
const CLICK_TRIGGER_COUNT = 2;

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function bumpClickCount(): number {
  try {
    const next = Number(sessionStorage.getItem(CLICK_COUNT_KEY) ?? "0") + 1;
    sessionStorage.setItem(CLICK_COUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

/**
 * Anonymous-visitor conversion prompt (Parts 15-19) — rendered only when
 * the SERVER already knows the visitor is signed out (see callers), so a
 * signed-in visitor never even ships this component's JS. Two triggers,
 * either of which shows the SAME modal at most once per browser session:
 *
 *   1. ~60 seconds of the page being open (a plain timer, not "meaningful
 *      activity" tracking — the simplest honest reading of "session
 *      time" without inventing an engagement-scoring system).
 *   2. A second official-website click in this session (sessionStorage
 *      count persists across page navigations in the same tab, so
 *      clicking once on the homepage and once on a developer page still
 *      trips this).
 *
 * Never blocks the first click, never claims a fake limit was reached,
 * and — critically — never shows twice: whichever trigger fires first
 * sets the same "shown" flag the other trigger also checks, so a visitor
 * who dismissed the timer prompt can't then be interrupted again by the
 * click trigger a moment later.
 */
export function LoginConversionPrompt() {
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (readFlag(SHOWN_KEY)) {
      shownRef.current = true;
      return;
    }

    function trigger() {
      if (shownRef.current) return;
      shownRef.current = true;
      setVisible(true);
    }

    const timer = window.setTimeout(trigger, TIME_TRIGGER_MS);

    function onOfficialWebsiteClick() {
      if (bumpClickCount() >= CLICK_TRIGGER_COUNT) trigger();
    }

    window.addEventListener(OFFICIAL_WEBSITE_CLICK_EVENT, onOfficialWebsiteClick);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OFFICIAL_WEBSITE_CLICK_EVENT, onOfficialWebsiteClick);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      /* private browsing or storage disabled — the prompt just won't remember it was dismissed this session */
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="login-prompt-title" className="text-lg font-semibold text-foreground">
            Get full access to Developer Connects
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to explore the complete verified developer directory — every published developer,
          searchable and filterable, with nothing held back.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={dismiss} className={buttonClassName("secondary", "w-full sm:w-auto")}>
            Maybe later
          </button>
          <SignInButton mode="modal" forceRedirectUrl="/post-sign-in">
            <button type="button" onClick={dismiss} className={buttonClassName("primary", "w-full sm:w-auto")}>
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    </div>
  );
}
