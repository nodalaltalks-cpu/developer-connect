import { safeRecordAnalyticsEvent, type AnalyticsEventSink } from "../developer-connect/events.ts";
import { isBotUserAgent, parseBatchBody, toAnalyticsEvent, type IngestResult, type VisitorContext } from "./events.ts";

/**
 * The collector's whole decision, framework-free so it can be tested without a server: drop bots and visitors who sent a
 * privacy signal, validate every event, and record the acceptable ones. Recording is best-effort (safeRecordAnalyticsEvent):
 * a database problem can never surface to the visitor or break a page.
 */
export async function ingestBehaviour(sink: AnalyticsEventSink, body: string, ctx: VisitorContext): Promise<IngestResult> {
  if (isBotUserAgent(ctx.userAgent)) return { accepted: 0, rejected: 0, dropped: "bot" };
  if (ctx.globalPrivacyControl) return { accepted: 0, rejected: 0, dropped: "privacy_signal" };
  const { events, problem } = parseBatchBody(body);
  if (problem) return { accepted: 0, rejected: 0, dropped: problem };

  let accepted = 0;
  let rejected = 0;
  for (const raw of events) {
    const event = toAnalyticsEvent(raw, ctx);
    if (!event) {
      rejected += 1;
      continue;
    }
    await safeRecordAnalyticsEvent(sink, event);
    accepted += 1;
  }
  return { accepted, rejected };
}
