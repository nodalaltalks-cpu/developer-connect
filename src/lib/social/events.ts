import { cleanReferrerHost, cleanToken } from "../behaviour/events.ts";
import { LINK_KEYS } from "./links.ts";
import { SOCIAL_EVENT_KINDS, VIDEO_PLATFORMS, type SocialEventKind, type ValidSocialEvent, type VideoPlatform } from "./types.ts";

/**
 * What the social collector accepts from the browser. The same rules as the rest of the site's analytics: an allow-list of event
 * kinds, a content id that must be a UUID (and is checked against the Founder's video list before it is stored), a link key from
 * the fixed list, clamped numbers, and no free text anywhere, so nothing a visitor typed can arrive here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WATCH_MS = 30 * 60_000;
export const MAX_SOCIAL_BATCH = 10;
export const MAX_SOCIAL_BODY_BYTES = 4 * 1024;

export function toSocialEvent(raw: unknown): ValidSocialEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !(SOCIAL_EVENT_KINDS as readonly string[]).includes(r.kind)) return null;
  const kind = r.kind as SocialEventKind;
  const event: ValidSocialEvent = { kind };

  const needsContent = kind === "video_impression" || kind === "video_play" || kind === "video_click";
  if (needsContent) {
    if (typeof r.contentId !== "string" || !UUID.test(r.contentId)) return null;
    event.contentId = r.contentId.toLowerCase();
  }
  if (kind === "link_click") {
    if (typeof r.linkKey !== "string" || !LINK_KEYS.includes(r.linkKey)) return null;
    event.linkKey = r.linkKey;
  }
  if (typeof r.platform === "string" && (VIDEO_PLATFORMS as readonly string[]).includes(r.platform)) event.platform = r.platform as VideoPlatform;
  if (kind === "video_play" && typeof r.watchMs === "number" && Number.isFinite(r.watchMs)) event.watchMs = Math.min(MAX_WATCH_MS, Math.max(0, Math.round(r.watchMs)));
  event.utmSource = cleanToken(r.utmSource);
  event.utmMedium = cleanToken(r.utmMedium);
  event.utmCampaign = cleanToken(r.utmCampaign);
  event.referrerHost = cleanReferrerHost(r.referrer);
  return event;
}

export function parseSocialBody(body: string): unknown[] {
  if (Buffer.byteLength(body, "utf8") > MAX_SOCIAL_BODY_BYTES) return [];
  try {
    const parsed = JSON.parse(body) as unknown;
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events) ? (parsed as { events: unknown[] }).events : [];
    return list.slice(0, MAX_SOCIAL_BATCH);
  } catch {
    return [];
  }
}
