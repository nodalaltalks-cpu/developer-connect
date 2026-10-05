import type { TouchInput } from "./types.ts";

/**
 * Cleans raw attribution parameters before they are stored in the immutable
 * marketing_touches table. Anything stored there is permanent, so this is
 * deliberately strict:
 *  - every value is trimmed and length-capped (a campaign name is never 5 KB);
 *  - a referrer is reduced to origin + path — a full referrer URL can carry a
 *    query string with personal data (an email in a link, a search term);
 *  - a landing path drops its query string for the same reason (the UTM
 *    parameters we care about are captured separately);
 *  - empty values become null, so "no campaign" is never the empty string.
 */

const MAX_PARAM_LENGTH = 200;
const MAX_PATH_LENGTH = 300;

function clean(value: string | null | undefined, max = MAX_PARAM_LENGTH): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** https://example.com/path?x=1#y -> https://example.com/path. Unparseable input becomes null. */
export function cleanReferrer(referrer: string | null | undefined): string | null {
  const value = clean(referrer, 2000);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.slice(0, MAX_PATH_LENGTH);
  } catch {
    return null;
  }
}

/** "/developers/acme?utm_source=x#top" -> "/developers/acme". Only same-site paths (starting with "/") are kept. */
export function cleanLandingPath(path: string | null | undefined): string | null {
  const value = clean(path, 2000);
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/)[0] ?? "";
  if (!withoutQuery.startsWith("/")) return null;
  return withoutQuery.slice(0, MAX_PATH_LENGTH);
}

export interface CleanTouch {
  sessionId: string;
  landingPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  occurredAt: Date | null;
}

export function cleanTouch(input: TouchInput): CleanTouch {
  return {
    sessionId: clean(input.sessionId, 100) ?? "unknown",
    landingPath: cleanLandingPath(input.landingPath),
    referrer: cleanReferrer(input.referrer),
    utmSource: clean(input.utmSource)?.toLowerCase() ?? null,
    utmMedium: clean(input.utmMedium)?.toLowerCase() ?? null,
    utmCampaign: clean(input.utmCampaign),
    utmContent: clean(input.utmContent),
    utmTerm: clean(input.utmTerm),
    gclid: clean(input.gclid, 300),
    fbclid: clean(input.fbclid, 300),
    occurredAt: input.occurredAt ?? null,
  };
}

/** True when a touch carries no campaign, referrer or click-id signal at all ("direct"). */
export function isDirectTouch(touch: Pick<CleanTouch, "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "gclid" | "fbclid">): boolean {
  return !touch.referrer && !touch.utmSource && !touch.utmMedium && !touch.utmCampaign && !touch.gclid && !touch.fbclid;
}
