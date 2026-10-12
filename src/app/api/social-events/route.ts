import { headers } from "next/headers";
import { isBotUserAgent } from "@/lib/behaviour/events";
import { MAX_SOCIAL_BODY_BYTES, parseSocialBody, toSocialEvent } from "@/lib/social/events";
import { recordSocialEvent, videoExists } from "@/lib/social/db/postgres-social";
import { getDeviceType, getOrCreateSessionId } from "@/lib/session";

/**
 * Social collector: what visitors do with the landing-page videos, the links page and the enquiry form. Public by design, so it
 * defends itself the same way /api/events does: a small body, an allow-list, no free text, bots and privacy-signal visitors
 * ignored, a video id only stored if it is one of the Founder's own videos. Always answers 204.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_SOCIAL_BODY_BYTES) return new Response(null, { status: 204 });
    const headerList = await headers();
    if (isBotUserAgent(headerList.get("user-agent")) || headerList.get("sec-gpc") === "1") return new Response(null, { status: 204 });
    const body = (await request.text()).slice(0, MAX_SOCIAL_BODY_BYTES + 1);
    const sessionId = await getOrCreateSessionId();
    const deviceType = await getDeviceType();
    const now = new Date();
    const known = new Map<string, boolean>();
    for (const raw of parseSocialBody(body)) {
      const event = toSocialEvent(raw);
      if (!event) continue;
      if (event.contentId) {
        if (!known.has(event.contentId)) known.set(event.contentId, await videoExists(event.contentId));
        if (!known.get(event.contentId)) continue;
      }
      await recordSocialEvent(event, { sessionId, deviceType, now });
    }
  } catch (error) {
    console.error("social collector failed:", error);
  }
  return new Response(null, { status: 204 });
}
