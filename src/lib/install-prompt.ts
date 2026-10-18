/**
 * The "install the app" nudge: when to show it, what it says, and what is remembered between visits. Pure functions with no browser
 * or framework imports, so every rule here is unit-tested; the banner (components/install-prompt.tsx) only renders what this decides.
 *
 * The rules, in the order the Founder asked for them:
 *  - it appears on a rhythm (first after a short wait, then every 2 minutes) until the visitor settles it;
 *  - "Don't show again" is permanent for that browser, and so is installing;
 *  - it never nags without limit (MAX_SHOWS), never shows to someone already using the installed app, never in a browser that
 *    cannot install (so the promise "one tap" is always true).
 * The wording uses only claims that are true of a home-screen app: nothing about speed we have not measured, no countdowns, no fake
 * scarcity or "N people installed".
 */

export const INSTALL_STORAGE_KEY = "dc_install_prompt";
/** How long after arriving the first banner waits: long enough to have seen the site, short enough to catch a short visit. */
export const FIRST_DELAY_MS = 45_000;
/** The rhythm the Founder asked for. */
export const REPEAT_MS = 120_000;
/** Retry delay when the banner could not be shown at its moment (another dialog is open, the tab is hidden). */
export const RETRY_MS = 15_000;
/** After this many showings without a decision, stop: persistence past this point costs more goodwill than it earns. */
export const MAX_SHOWS = 6;
/** The banner leaves by itself after this long if untouched (it returns on the next 2-minute beat). */
export const AUTO_HIDE_MS = 25_000;

export interface InstallState {
  /** The visitor pressed "Don't show again". Permanent. */
  ignored: boolean;
  /** The app was installed (or the visitor added it to the home screen). Permanent. */
  installed: boolean;
  /** How many times the banner has been shown. */
  shown: number;
  /** Earliest time (ms since epoch) the next banner may appear; 0 means "not scheduled yet". */
  nextAt: number;
}

export const INITIAL_INSTALL_STATE: InstallState = { ignored: false, installed: false, shown: 0, nextAt: 0 };

/** Reads the stored state defensively: anything unreadable is treated as a first visit (never as "ignored"). */
export function parseInstallState(raw: string | null | undefined): InstallState {
  if (!raw) return INITIAL_INSTALL_STATE;
  try {
    const value = JSON.parse(raw) as Partial<InstallState> | null;
    if (!value || typeof value !== "object") return INITIAL_INSTALL_STATE;
    const count = typeof value.shown === "number" && Number.isFinite(value.shown) ? Math.min(Math.max(Math.trunc(value.shown), 0), 1000) : 0;
    const next = typeof value.nextAt === "number" && Number.isFinite(value.nextAt) && value.nextAt > 0 ? value.nextAt : 0;
    return { ignored: value.ignored === true, installed: value.installed === true, shown: count, nextAt: next };
  } catch {
    return INITIAL_INSTALL_STATE;
  }
}

export function serializeInstallState(state: InstallState): string {
  return JSON.stringify(state);
}

/** True once the visitor should never be asked again, however much time passes. */
export function isSettled(state: InstallState): boolean {
  return state.ignored || state.installed || state.shown >= MAX_SHOWS;
}

/**
 * What to do now: "settled" (never again), or the number of ms to wait before the banner is due (0 = due now).
 * A first visit is scheduled FIRST_DELAY_MS from `now`; a later one at the stored time, so a page refresh or a click through to
 * another page does not restart the 2-minute rhythm.
 */
export function msUntilDue(state: InstallState, now: number): "settled" | number {
  if (isSettled(state)) return "settled";
  const due = state.nextAt > 0 ? state.nextAt : now + FIRST_DELAY_MS;
  return Math.max(0, due - now);
}

/** The state after the banner was put on screen. */
export function afterShown(state: InstallState, now: number): InstallState {
  return { ...state, shown: state.shown + 1, nextAt: now + REPEAT_MS };
}

/** The visitor said "Not now" (or let it leave): same rhythm, nothing permanent. */
export function afterLater(state: InstallState, now: number): InstallState {
  return { ...state, nextAt: Math.max(state.nextAt, now + REPEAT_MS) };
}

/** "Don't show again". */
export function afterIgnored(state: InstallState): InstallState {
  return { ...state, ignored: true };
}

export function afterInstalled(state: InstallState): InstallState {
  return { ...state, installed: true };
}

// --- environment ---------------------------------------------------------------------------------

export type InstallPath = "native" | "ios" | "none";

export interface InstallEnvironment {
  userAgent: string;
  /** navigator.maxTouchPoints, to tell an iPad that reports itself as a Mac. */
  maxTouchPoints: number;
  platform: string;
  /** Already running as an installed app (display-mode: standalone, or iOS navigator.standalone). */
  standalone: boolean;
  /** A browser install event (beforeinstallprompt) has been received. */
  hasNativePrompt: boolean;
}

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|GSA\//i;

export function isIosDevice(env: Pick<InstallEnvironment, "userAgent" | "maxTouchPoints" | "platform">): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  return env.platform === "MacIntel" && env.maxTouchPoints > 1;
}

/**
 * How this visitor can install, or "none" (no banner at all). A page opened inside the Facebook / Instagram / Google app has no way
 * to add a home-screen app, so it is never shown the banner (it would promise something the browser cannot do).
 */
export function installPathFor(env: InstallEnvironment): InstallPath {
  if (env.standalone) return "none";
  if (IN_APP_BROWSER.test(env.userAgent)) return "none";
  if (env.hasNativePrompt) return "native";
  if (isIosDevice(env)) return "ios";
  return "none";
}

/** Public pages only: never over sign-in, the profile, the team workspace or the Founder's admin. */
const NO_PROMPT_PREFIXES = ["/admin", "/team", "/profile", "/post-sign-in", "/sign-in", "/sign-up", "/testimonial"] as const;
export function installPromptAllowedOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !NO_PROMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// --- wording -------------------------------------------------------------------------------------

export interface InstallMessage {
  headline: string;
  body: string;
}

/**
 * Three honest framings, rotated so a repeat is never the same sentence twice in a row:
 *  1. the benefit the visitor feels (one tap, full screen);
 *  2. their own situation (a property decision takes days, so make coming back effortless);
 *  3. the cost, made small and reversible (free, seconds, no app store, removable).
 */
const MESSAGES: readonly InstallMessage[] = [
  { headline: "Keep Developer Connects one tap away", body: "Add it to your home screen and it opens full screen, like an app. No app store." },
  { headline: "Choosing a home takes days. Make coming back effortless.", body: "Put Developer Connects on your home screen and return to your search in one tap." },
  { headline: "Free, takes about 5 seconds", body: "Add it to your home screen, and remove it any time. Nothing to download from a store." },
];

/** The message for the visitor's n-th showing (0 for the first). */
export function installMessage(shownBefore: number): InstallMessage {
  return MESSAGES[((shownBefore % MESSAGES.length) + MESSAGES.length) % MESSAGES.length];
}

export const IOS_STEPS: readonly string[] = [
  "Tap the Share button (the square with an arrow) in your browser's toolbar.",
  "Scroll down and choose “Add to Home Screen”.",
  "Tap “Add”. Developer Connects now sits with your other apps.",
];

export const BROWSER_MENU_STEPS: readonly string[] = [
  "Open your browser's menu (the three dots).",
  "Choose “Install app” or “Add to Home screen”.",
  "Confirm. Developer Connects now sits with your other apps.",
];

// --- what the Founder's dashboard counts ---------------------------------------------------------

/** The behaviour-event ids the banner records (allow-listed in lib/behaviour/events.ts). */
export const INSTALL_EVENTS = {
  shown: "install_prompt_shown",
  accepted: "install_prompt_accepted", // pressed Install / Add to home screen
  steps: "install_prompt_steps", // opened the how-to steps (iPhone, or a browser without a one-tap prompt)
  later: "install_prompt_later", // "Not now"
  never: "install_prompt_never", // "Don't show again"
  completed: "install_completed", // the browser confirmed the app was installed
  declined: "install_native_declined", // saw the browser's own install box and cancelled it
  opened: "install_app_opened", // a visit from inside the installed app (once per visit)
} as const;
export type InstallEventId = (typeof INSTALL_EVENTS)[keyof typeof INSTALL_EVENTS];
