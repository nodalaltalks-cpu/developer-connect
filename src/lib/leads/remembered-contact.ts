import { ANALYTICS_CONSENT_STORAGE_KEY, parseAnalyticsConsent } from "../analytics-config.ts";

/**
 * "Enquire as Meera": the name and mobile number a visitor typed into an enquiry form, kept ON THEIR DEVICE so the next form is
 * already filled and a single tap sends it (the pattern that makes in-app lead forms convert).
 *
 * Rules:
 *  - written only after the visitor presses send on a form (their own action);
 *  - kept for this browser session always, and in local storage ONLY when they accepted analytics cookies, the same rule the
 *    first-arrival record follows. Without that consent it is gone when the tab closes;
 *  - never sent anywhere until they press send again; "Not you?" removes it at once;
 *  - Indian 10-digit mobile numbers only, so a stored value can always be shown and re-sent without guessing a country.
 * Every function is safe where storage is blocked (private browsing): it simply remembers nothing.
 */

export const REMEMBERED_CONTACT_KEY = "dc_contact_v1";
export const REMEMBERED_CONTACT_EVENT = "dc-contact-changed";

export interface RememberedContact {
  name: string;
  /** The 10-digit Indian mobile number, digits only. */
  digits: string;
}

/** Validates a stored value. Anything unexpected (old version, tampered, wrong shape) counts as nothing remembered. */
export function parseRememberedContact(raw: string | null | undefined): RememberedContact | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RememberedContact>;
    if (typeof value !== "object" || value === null) return null;
    const name = typeof value.name === "string" ? value.name.replace(/\s+/g, " ").trim() : "";
    const digits = typeof value.digits === "string" ? value.digits : "";
    if (name.length < 2 || name.length > 120) return null;
    if (!/^[6-9]\d{9}$/.test(digits)) return null;
    return { name, digits };
  } catch {
    return null;
  }
}

/** Typed input to the 10 digits a stored contact needs, or null when it is not a complete Indian mobile number. */
export function indianMobileDigits(typed: string): string | null {
  let digits = typed.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** "+91 98•••• •210": enough to recognise it as theirs, not enough to read it off a shoulder. */
export function maskDigits(digits: string): string {
  return `+91 ${digits.slice(0, 2)}•••• •${digits.slice(-3)}`;
}

// --- browser storage (DOM-facing; guarded) -------------------------------------------------------------------

function safe<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

/** The raw stored value (session first, then local), for useSyncExternalStore. Parse it with parseRememberedContact. */
export function readRememberedContactRaw(): string {
  if (typeof window === "undefined") return "";
  return safe(() => window.sessionStorage.getItem(REMEMBERED_CONTACT_KEY) ?? window.localStorage.getItem(REMEMBERED_CONTACT_KEY) ?? "", "");
}

export function subscribeRememberedContact(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(REMEMBERED_CONTACT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(REMEMBERED_CONTACT_EVENT, onChange);
  };
}

export function rememberContact(contact: RememberedContact): void {
  if (typeof window === "undefined") return;
  const parsed = parseRememberedContact(JSON.stringify(contact));
  if (!parsed) return;
  const value = JSON.stringify(parsed);
  safe(() => window.sessionStorage.setItem(REMEMBERED_CONTACT_KEY, value), undefined);
  const accepted = safe(() => parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)) === "all", false);
  if (accepted) safe(() => window.localStorage.setItem(REMEMBERED_CONTACT_KEY, value), undefined);
  window.dispatchEvent(new Event(REMEMBERED_CONTACT_EVENT));
}

export function forgetContact(): void {
  if (typeof window === "undefined") return;
  safe(() => window.sessionStorage.removeItem(REMEMBERED_CONTACT_KEY), undefined);
  safe(() => window.localStorage.removeItem(REMEMBERED_CONTACT_KEY), undefined);
  window.dispatchEvent(new Event(REMEMBERED_CONTACT_EVENT));
}
