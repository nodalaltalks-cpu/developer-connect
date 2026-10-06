import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { ingestProviderEvent } from "@/lib/leads/call-service";
import { getTelephonyProvider, WebhookVerificationError } from "@/lib/leads/telephony";

/**
 * Where the telephony provider reports what happened to a call. This is the ONLY way a call's status, answered/ended
 * times and duration ever change.
 *
 *  - Not configured: answers 503 and does nothing (today's state — no provider is connected).
 *  - Configured: the provider adapter must PROVE the request came from the provider (signature/secret) before any event
 *    is read; anything it cannot prove is a 401 and is never parsed into an event.
 *  - Idempotent: each event carries the provider's own event id; a redelivery is stored and applied once.
 *
 * This route is public by necessity (the provider is not signed in), which is exactly why it trusts nothing it cannot
 * verify. It is not linked from anywhere and returns no lead or call data.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const provider = getTelephonyProvider();
  if (!provider.configured) return new Response("Telephony is not configured.", { status: 503 });

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let events;
  try {
    events = provider.parseWebhook(rawBody, headers);
  } catch (error) {
    return new Response(error instanceof WebhookVerificationError ? "Unauthorized." : "Bad request.", { status: error instanceof WebhookVerificationError ? 401 : 400 });
  }

  const repos = createPostgresLeadRepositories();
  let applied = 0;
  for (const event of events) {
    try {
      const outcome = await ingestProviderEvent(repos, event);
      if (outcome.applied) applied += 1;
    } catch {
      // A malformed event is skipped; the provider will retry the delivery if we answer non-2xx, so we only do that for failures below.
    }
  }
  return Response.json({ received: events.length, applied });
}
