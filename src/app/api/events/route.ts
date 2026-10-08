import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { ingestBehaviour } from "@/lib/behaviour/ingest";
import { MAX_BODY_BYTES } from "@/lib/behaviour/events";
import { getDeviceType, getOrCreateSessionId } from "@/lib/session";

/**
 * Visitor-behaviour collector. Public by design (anonymous visitors are the point), so it defends itself:
 * a small body, an allow-list of events, no personal data accepted, bots and privacy-signal visitors ignored (see
 * lib/behaviour). It always answers 204 - the browser never learns whether anything was stored, and a failure here
 * can never affect the page. Sent with navigator.sendBeacon, so it also works while the page is closing.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return new Response(null, { status: 204 });
    const body = (await request.text()).slice(0, MAX_BODY_BYTES + 1);
    const headerList = await headers();
    const { userId } = await auth();
    await ingestBehaviour(postgresAnalyticsSink, body, {
      sessionId: await getOrCreateSessionId(),
      userId: userId ?? undefined,
      deviceType: await getDeviceType(),
      userAgent: headerList.get("user-agent"),
      globalPrivacyControl: headerList.get("sec-gpc") === "1",
      now: new Date(),
    });
  } catch (error) {
    console.error("behaviour collector failed:", error);
  }
  return new Response(null, { status: 204 });
}
