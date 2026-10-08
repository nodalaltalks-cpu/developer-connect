import type { AnalyticsEvent, DeviceType } from "../developer-connect/events.ts";

/**
 * First-party visitor behaviour: what the collector (/api/events) accepts, and how it is cleaned.
 *
 * Privacy rules enforced HERE, not trusted from the browser:
 *  - only an allow-list of event names and click ids is accepted (nothing free-form, no text the visitor typed);
 *  - a path only (never a full URL, query string or fragment); private areas are never recorded;
 *  - a referrer is reduced to its host; UTM values are short, plain tokens;
 *  - numbers are clamped; a batch is small; bots and visitors who send a Global Privacy Control signal are dropped;
 *  - no phone, email, name or lead id is accepted anywhere in this shape.
 */

export const CLIENT_EVENT_NAMES = ["page_viewed", "page_engagement", "cta_clicked"] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

/** The buttons whose clicks are tracked. Anything else is rejected, so the dashboard has a fixed, readable vocabulary. */
export const CTA_IDS = [
  "connect_developer", // the main Connect button on a developer page
  "connect_sticky", // the phone-only sticky Connect bar
  "connect_card", // Connect on a directory card
  "whatsapp_share",
  "email_share",
  "copy_link",
  "native_share",
  "sign_in",
  "newsletter_submit",
  "contact_submit",
  "hero_market_dubai", // the Dubai button in the homepage hero
  "hero_market_mumbai", // the Mumbai button in the homepage hero
  "advisor_open", // "Talk to an Advisor" (hero, page CTA or the sticky bar): opens the contact choices
  "advisor_whatsapp", // WhatsApp, opened with a pre-filled message
  "advisor_email", // a pre-addressed email
  "advisor_call", // a phone call to the advisor
  "advisor_linkedin", // the founder profile link
] as const;
export type CtaId = (typeof CTA_IDS)[number];

export const MAX_BATCH_EVENTS = 20;
export const MAX_BODY_BYTES = 8 * 1024;
const MAX_ENGAGED_SECONDS = 1800; // 30 minutes: a longer "engaged" time is a forgotten tab, not interest
const PRIVATE_PREFIXES = ["/admin", "/profile", "/post-sign-in", "/team", "/api", "/sign-in", "/sign-up", "/testimonial"] as const;

export interface RawClientEvent {
  name?: unknown;
  path?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  hasGclid?: unknown;
  hasFbclid?: unknown;
  viewportWidth?: unknown;
  engagedSeconds?: unknown;
  maxScrollPercent?: unknown;
  clicks?: unknown;
  ctaId?: unknown;
}

/** A path the visitor may be tracked on: a plain public page path. */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/)[0].trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 200) return null;
  if (!/^\/[A-Za-z0-9\-._~/%]*$/.test(path)) return null;
  const lower = path.toLowerCase();
  if (PRIVATE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))) return null;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** A referrer reduced to its bare host ("www.google.com"), or undefined. A full URL is never kept. */
export function cleanReferrerHost(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return /^[a-z0-9.-]{1,100}$/.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

/** A UTM value: short plain token, lower-cased. Anything with spaces, symbols or length is dropped (it could carry personal data). */
export function cleanToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  return /^[a-z0-9_.\-+]{1,60}$/.test(token) ? token : undefined;
}

const clampInt = (value: unknown, min: number, max: number): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
};

/** "xs" <360, "sm" <430, "md" <768, "lg" otherwise: a layout class, never the exact size. */
export function viewportClass(width: unknown): string | undefined {
  const w = clampInt(width, 0, 10_000);
  if (w === null || w === 0) return undefined;
  return w < 360 ? "xs" : w < 430 ? "sm" : w < 768 ? "md" : "lg";
}

const BOT_PATTERN = /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|monitor|uptime|preview/i;
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export interface VisitorContext {
  sessionId: string;
  userId?: string;
  deviceType: DeviceType;
  userAgent: string | null;
  /** Sec-GPC header: the visitor's browser asks not to be tracked. */
  globalPrivacyControl: boolean;
  now: Date;
}

/** Converts ONE raw client event into a stored event, or null if it is not acceptable. */
export function toAnalyticsEvent(raw: RawClientEvent, ctx: VisitorContext): AnalyticsEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const path = cleanPath(raw.path);
  if (!path) return null;
  const base = { occurredAt: ctx.now, sessionId: ctx.sessionId, userId: ctx.userId, deviceType: ctx.deviceType };

  switch (raw.name) {
    case "page_viewed":
      return {
        ...base,
        eventName: "page_viewed",
        path,
        referrerHost: cleanReferrerHost(raw.referrer),
        utmSource: cleanToken(raw.utmSource),
        utmMedium: cleanToken(raw.utmMedium),
        utmCampaign: cleanToken(raw.utmCampaign),
        hasGclid: raw.hasGclid === true ? true : undefined,
        hasFbclid: raw.hasFbclid === true ? true : undefined,
        viewport: viewportClass(raw.viewportWidth),
      };
    case "page_engagement": {
      const engagedSeconds = clampInt(raw.engagedSeconds, 0, MAX_ENGAGED_SECONDS);
      const maxScrollPercent = clampInt(raw.maxScrollPercent, 0, 100);
      const clicks = clampInt(raw.clicks, 0, 200);
      if (engagedSeconds === null || maxScrollPercent === null || clicks === null) return null;
      return { ...base, eventName: "page_engagement", path, engagedSeconds, maxScrollPercent, clicks };
    }
    case "cta_clicked": {
      const ctaId = typeof raw.ctaId === "string" && (CTA_IDS as readonly string[]).includes(raw.ctaId) ? raw.ctaId : null;
      return ctaId ? { ...base, eventName: "cta_clicked", path, ctaId } : null;
    }
    default:
      return null;
  }
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  /** Why the whole batch was ignored, when it was. */
  dropped?: "bot" | "privacy_signal" | "empty" | "too_large" | "malformed";
}

/** Parses the request body (JSON text) into raw events. Never throws. */
export function parseBatchBody(body: string): { events: RawClientEvent[]; problem?: "too_large" | "malformed" | "empty" } {
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return { events: [], problem: "too_large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { events: [], problem: "malformed" };
  }
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events) ? (parsed as { events: unknown[] }).events : null;
  if (!list) return { events: [], problem: "malformed" };
  if (list.length === 0) return { events: [], problem: "empty" };
  return { events: list.slice(0, MAX_BATCH_EVENTS) as RawClientEvent[] };
}
