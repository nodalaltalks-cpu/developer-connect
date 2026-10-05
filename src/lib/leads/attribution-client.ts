/**
 * Browser-side attribution helpers. Pure functions over plain inputs (a URL
 * search string, a referrer, a stored value) so they are unit-testable
 * without a DOM; the thin React component (AttributionCapture) only reads
 * `window` and calls these.
 *
 * What is remembered, and where:
 *  - the CURRENT touch — how this browsing session arrived — in sessionStorage;
 *  - the FIRST touch — the earliest arrival we know of — in sessionStorage,
 *    and ALSO in localStorage (so it survives across visits) ONLY when the
 *    visitor has accepted analytics cookies. Without consent it lasts the
 *    session only.
 * Neither ever holds personal data: campaign parameters, a landing path and
 * the referrer's origin + path. The server cleans them again and attaches its
 * own session id; nothing here is trusted.
 */

export interface StoredTouch {
  landingPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  occurredAt: string;
}

export const CURRENT_TOUCH_KEY = "dc_attr_current_v1";
export const FIRST_TOUCH_KEY = "dc_attr_first_v1";

function param(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim();
  return value ? value.slice(0, 200) : null;
}

/** Only an EXTERNAL referrer counts; navigating between our own pages is not an arrival. */
export function externalReferrer(referrer: string | null | undefined, ownHost: string): string | null {
  const value = (referrer ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host === ownHost) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function touchFromLocation(input: {
  search: string;
  pathname: string;
  referrer: string | null | undefined;
  ownHost: string;
  now: Date;
}): StoredTouch {
  const params = new URLSearchParams(input.search);
  return {
    landingPath: input.pathname.startsWith("/") ? input.pathname.slice(0, 300) : null,
    referrer: externalReferrer(input.referrer, input.ownHost),
    utmSource: param(params, "utm_source"),
    utmMedium: param(params, "utm_medium"),
    utmCampaign: param(params, "utm_campaign"),
    utmContent: param(params, "utm_content"),
    utmTerm: param(params, "utm_term"),
    gclid: param(params, "gclid"),
    fbclid: param(params, "fbclid"),
    occurredAt: input.now.toISOString(),
  };
}

/** True when the touch carries a campaign or click-id signal (something worth attributing to). */
export function hasCampaignSignal(touch: StoredTouch): boolean {
  return Boolean(touch.utmSource || touch.utmMedium || touch.utmCampaign || touch.gclid || touch.fbclid);
}

/** True when the touch carries any signal at all — a campaign OR an external referrer. */
export function hasAnySignal(touch: StoredTouch): boolean {
  return hasCampaignSignal(touch) || Boolean(touch.referrer);
}

/**
 * Decides the CURRENT touch. A new campaign arrival replaces the old one; a
 * plain page view (no campaign) keeps what we had; with nothing stored yet,
 * the incoming touch is stored as-is (even "direct").
 */
export function nextCurrentTouch(existing: StoredTouch | null, incoming: StoredTouch): StoredTouch {
  if (hasCampaignSignal(incoming)) return incoming;
  if (existing) return existing;
  return incoming;
}

/**
 * Decides the FIRST touch. Once set it is never replaced — except that a
 * stored "direct" first touch is upgraded the first time a real signal
 * (campaign or external referrer) appears, since "direct" only means we had
 * not yet seen how they arrived.
 */
export function nextFirstTouch(existing: StoredTouch | null, incoming: StoredTouch): StoredTouch {
  if (!existing) return incoming;
  if (!hasAnySignal(existing) && hasAnySignal(incoming)) return incoming;
  return existing;
}

export function parseStoredTouch(raw: string | null | undefined): StoredTouch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredTouch>;
    if (typeof value !== "object" || value === null || typeof value.occurredAt !== "string") return null;
    const text = (key: keyof StoredTouch) => (typeof value[key] === "string" ? (value[key] as string) : null);
    return {
      landingPath: text("landingPath"),
      referrer: text("referrer"),
      utmSource: text("utmSource"),
      utmMedium: text("utmMedium"),
      utmCampaign: text("utmCampaign"),
      utmContent: text("utmContent"),
      utmTerm: text("utmTerm"),
      gclid: text("gclid"),
      fbclid: text("fbclid"),
      occurredAt: value.occurredAt,
    };
  } catch {
    return null;
  }
}

/** The payload the gate sends with a submission. The server re-cleans it and adds its own session id. */
export function attributionPayload(current: StoredTouch | null, first: StoredTouch | null): {
  currentTouch?: StoredTouch;
  firstTouch?: StoredTouch | null;
} {
  return {
    ...(current ? { currentTouch: current } : {}),
    firstTouch: first && current && first.occurredAt === current.occurredAt ? null : first,
  };
}
