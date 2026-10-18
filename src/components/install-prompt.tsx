"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { trackCta } from "@/lib/behaviour/client";
import {
  AUTO_HIDE_MS,
  BROWSER_MENU_STEPS,
  INSTALL_EVENTS,
  INSTALL_STORAGE_KEY,
  IOS_STEPS,
  REPEAT_MS,
  RETRY_MS,
  afterIgnored,
  afterInstalled,
  afterLater,
  afterShown,
  installMessage,
  installPathFor,
  installPromptAllowedOnPath,
  msUntilDue,
  parseInstallState,
  serializeInstallState,
  type InstallState,
} from "@/lib/install-prompt";
import { isOtherModalOpen } from "@/lib/modal-lock";

/** The browser's install event: not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readState(): InstallState {
  try {
    return parseInstallState(window.localStorage.getItem(INSTALL_STORAGE_KEY));
  } catch {
    return parseInstallState(null);
  }
}

function writeState(state: InstallState): void {
  try {
    window.localStorage.setItem(INSTALL_STORAGE_KEY, serializeInstallState(state));
  } catch {
    // storage blocked: the banner just will not remember; it still caps itself within this page view
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/**
 * The "install the app" banner. Drops in from the top on a rhythm (first after a short wait, then every 2 minutes) until the visitor
 * installs or presses "Don't show again", which is permanent for that browser (lib/install-prompt.ts holds every rule and the
 * wording). Chrome, Edge and Samsung Internet get the real one-tap install; iPhones and iPads get the three Add to Home Screen steps;
 * every other browser, and anyone already in the installed app or inside the Facebook / Instagram app, never sees it.
 * Every outcome is recorded as a first-party event (INSTALL_EVENTS) for the Founder's behaviour page. Never blocks the page or any
 * dialog: it waits while the contact form or sign-in prompt is open.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const timer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const paused = useRef(false);
  const completedSent = useRef(false);

  const [visible, setVisible] = useState(false);
  const [shownIndex, setShownIndex] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [path, setPath] = useState<"native" | "ios">("native");

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const track = useCallback((id: string) => trackCta(id, pathRef.current || "/", true), []);

  const clearTimers = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    timer.current = null;
    hideTimer.current = null;
  }, []);

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const now = Date.now();
    const state = readState();
    const wait = msUntilDue(state, now);
    if (wait === "settled") return;
    // First visit: remember when the first banner is due, so a refresh or a click to another page does not restart the wait.
    if (state.nextAt === 0) writeState({ ...state, nextAt: now + wait });

    timer.current = window.setTimeout(() => {
      const current = readState();
      if (msUntilDue(current, Date.now()) === "settled") return;
      const route = installPathFor({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        platform: navigator.platform ?? "",
        standalone: isStandalone(),
        hasNativePrompt: deferred.current !== null,
      });
      const blocked = document.visibilityState !== "visible" || isOtherModalOpen() || !installPromptAllowedOnPath(pathRef.current);
      if (route === "none" || blocked) {
        // Not polite right now (a hidden tab, an open form, a page the banner skips): look again shortly. Not possible in this
        // browser: look again on the slow beat, in case the browser's install event arrives late.
        timer.current = window.setTimeout(schedule, route === "none" && !blocked ? REPEAT_MS : RETRY_MS);
        return;
      }
      writeState(afterShown(current, Date.now()));
      setShownIndex(current.shown);
      setPath(route);
      setShowSteps(false);
      setVisible(true);
      track(INSTALL_EVENTS.shown);
    }, wait);
  }, [track]);

  // Install events, and the first schedule.
  useEffect(() => {
    if (isStandalone()) {
      // Someone using the installed app: never the banner, but count the visit so the Founder sees installs being used.
      try {
        if (window.sessionStorage.getItem("dc_app_open_sent") !== "1") {
          window.sessionStorage.setItem("dc_app_open_sent", "1");
          track(INSTALL_EVENTS.opened);
        }
      } catch {
        // storage blocked: count nothing rather than every page
      }
      return;
    }
    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // keep the browser's own mini-bar away; ours is the one prompt
      deferred.current = event as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      writeState(afterInstalled(readState()));
      if (!completedSent.current) {
        completedSent.current = true;
        track(INSTALL_EVENTS.completed);
      }
      deferred.current = null;
      clearTimers();
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    // The browser only offers installation to a site with a service worker it can find; the existing one makes no requests.
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
    schedule();
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimers();
    };
  }, [schedule, clearTimers, track]);

  const hide = useCallback(() => {
    setVisible(false);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    schedule();
  }, [schedule]);

  // Leaves by itself if untouched, and comes back on the next beat. Reading the steps or hovering pauses it.
  useEffect(() => {
    if (!visible) return;
    const arm = () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        if (paused.current) arm();
        else hide();
      }, AUTO_HIDE_MS);
    };
    arm();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") later();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
    // `later` is stable enough for this: it only calls track and hide, which are themselves stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hide]);

  function later() {
    track(INSTALL_EVENTS.later);
    writeState(afterLater(readState(), Date.now()));
    hide();
  }

  function never() {
    track(INSTALL_EVENTS.never);
    writeState(afterIgnored(readState()));
    clearTimers();
    setVisible(false);
  }

  async function install() {
    track(INSTALL_EVENTS.accepted);
    const event = deferred.current;
    if (!event) {
      // No one-tap prompt available (iPhone, or the browser already used its one): show how to do it by hand.
      track(INSTALL_EVENTS.steps);
      paused.current = true;
      setShowSteps(true);
      return;
    }
    deferred.current = null; // an install event can be used once
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        writeState(afterInstalled(readState()));
        if (!completedSent.current) {
          completedSent.current = true;
          track(INSTALL_EVENTS.completed);
        }
        clearTimers();
        setVisible(false);
      } else {
        track(INSTALL_EVENTS.declined);
        hide();
      }
    } catch {
      track(INSTALL_EVENTS.steps);
      paused.current = true;
      setShowSteps(true);
    }
  }

  // Also hidden while on a page the banner must not appear on (sign-in, admin...).
  if (!visible || !installPromptAllowedOnPath(pathname)) return null;

  const message = installMessage(shownIndex);
  const steps = path === "ios" ? IOS_STEPS : BROWSER_MENU_STEPS;
  const hold = (on: boolean) => () => {
    paused.current = on || showSteps;
  };

  return (
    <div
      role="region"
      aria-label="Install Developer Connects"
      className="dc-drop fixed inset-x-0 top-0 z-[60] border-b border-white/10 bg-ink text-pearl shadow-2xl"
      onMouseEnter={hold(true)}
      onMouseLeave={hold(false)}
      onTouchStart={hold(true)}
      onFocus={hold(true)}
      onBlur={hold(false)}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="mt-0.5 size-11 shrink-0 rounded-xl bg-white" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-white">{message.headline}</p>
            <p className="mt-0.5 text-sm leading-snug text-mist">{message.body}</p>
          </div>
          <button
            type="button"
            onClick={later}
            aria-label="Close, ask me again later"
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-mist hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300 sm:hidden"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <button type="button" onClick={install} className={buttonClassName("gold", "dc-nudge flex-1 sm:flex-none")}>
            {path === "native" ? "Install app" : "Add to Home Screen"}
          </button>
          <button
            type="button"
            onClick={later}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/25 px-4 text-sm font-medium text-pearl hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
          >
            Not now
          </button>
        </div>
      </div>

      {showSteps && (
        <ol className="mx-auto max-w-3xl list-decimal space-y-1.5 px-4 pb-3 pl-9 text-sm text-pearl sm:pl-9">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      <div className="mx-auto flex max-w-3xl justify-end px-4 pb-1">
        <button
          type="button"
          onClick={never}
          className="inline-flex min-h-11 items-center text-xs text-mist underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
        >
          Don&apos;t show this again
        </button>
      </div>
    </div>
  );
}
