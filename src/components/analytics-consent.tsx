"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@/components/google-analytics";
import { buttonClassName } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  gaCookieNamesIn,
  isAnalyticsExcludedPath,
  parseAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics-config";

interface ConsentContextValue {
  /** True only when a valid Google Analytics ID is configured — otherwise there is nothing to consent to. */
  enabled: boolean;
  openSettings: () => void;
}

const ConsentContext = createContext<ConsentContextValue>({ enabled: false, openSettings: () => {} });

// --- The stored choice, read as an external store -----------------------
// Read with useSyncExternalStore so the server render and first client
// render agree (the choice is unknown until the browser can be asked), with
// no state-setting inside an effect.

const CONSENT_EVENT = "dc-analytics-consent-change";
/** What the server (and the very first client render) sees: "not known yet", distinct from "no choice made". */
const UNKNOWN = "__unknown__";
/** Used only when localStorage is unavailable, so the choice still applies for this page view. */
let memoryChoice: AnalyticsConsent | null = null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CONSENT_EVENT, onChange);
  };
}

function getSnapshot(): string {
  if (memoryChoice) return memoryChoice;
  try {
    return parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) ?? "";
  } catch {
    // Storage blocked: behave as "no choice yet" — Google Analytics stays off.
    return "";
  }
}

const getServerSnapshot = () => UNKNOWN;

function storeConsent(choice: AnalyticsConsent): void {
  memoryChoice = choice;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
    memoryChoice = null; // persisted; localStorage is now the source of truth
  } catch {
    // Not persisted; the in-memory value above still applies until the page is closed.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Removes Google Analytics cookies (on the exact host and its parent domain) when a visitor withdraws consent. */
function removeGaCookies(): void {
  const names = gaCookieNamesIn(document.cookie);
  if (names.length === 0) return;
  const hostParts = window.location.hostname.split(".");
  const domains = [window.location.hostname];
  if (hostParts.length > 2) domains.push(hostParts.slice(-2).join("."));
  domains.push(`.${hostParts.slice(-2).join(".")}`);
  for (const name of names) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    }
  }
}

/**
 * Owns the analytics-cookie choice. Google Analytics is mounted ONLY when
 * the visitor has pressed "Accept" (consent === "all"); with no choice yet,
 * or "Accept only essentials", it never loads. The two buttons are
 * deliberately identical in size, weight and style — neither is visually
 * favoured — and there is no "Reject" button and no pre-selected default.
 *
 * With no measurement ID configured this renders the page untouched and
 * shows no banner, since only strictly necessary cookies exist in that case.
 */
export function AnalyticsConsentProvider({
  measurementId,
  children,
}: {
  measurementId: string | null;
  children: ReactNode;
}) {
  const enabled = measurementId !== null;
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = stored !== UNKNOWN;
  const consent = parseAnalyticsConsent(stored);
  // True after the visitor opens "Cookie settings" to change an earlier choice.
  const [reopened, setReopened] = useState(false);

  const choose = useCallback(
    (choice: AnalyticsConsent) => {
      storeConsent(choice);
      setReopened(false);
      if (measurementId) {
        (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = choice !== "all";
      }
      if (choice === "essential") removeGaCookies();
    },
    [measurementId],
  );

  const openSettings = useCallback(() => setReopened(true), []);
  const value = useMemo<ConsentContextValue>(() => ({ enabled, openSettings }), [enabled, openSettings]);

  // No choice yet (consent === null) shows the banner; so does reopening it from the footer.
  const showBanner = enabled && ready && (consent === null || reopened) && !isAnalyticsExcludedPath(pathname);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {measurementId !== null && consent === "all" && <GoogleAnalytics measurementId={measurementId} />}
      {showBanner && (
        <div
          role="region"
          aria-label="Cookie choices"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background p-4 shadow-lg sm:p-5"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              We use essential cookies to make Developer Connects work. With your permission we&apos;d also
              use Google Analytics cookies to understand how the site is used.{" "}
              <Link href="/cookies" className="text-accent-hover underline">
                Cookie Policy
              </Link>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
              <button type="button" onClick={() => choose("all")} className={buttonClassName("secondary")}>
                Accept
              </button>
              <button type="button" onClick={() => choose("essential")} className={buttonClassName("secondary")}>
                Accept only essentials
              </button>
            </div>
          </div>
        </div>
      )}
    </ConsentContext.Provider>
  );
}

/**
 * Footer link that reopens the choice. Renders nothing when analytics isn't
 * configured (no choice to change), so it can sit in the footer permanently.
 */
export function CookieSettingsButton() {
  const { enabled, openSettings } = useContext(ConsentContext);
  if (!enabled) return null;
  return (
    <li>
      <button
        type="button"
        onClick={openSettings}
        className="inline-flex min-h-11 items-center text-sm text-foreground hover:text-accent-hover hover:underline"
      >
        Cookie settings
      </button>
    </li>
  );
}
