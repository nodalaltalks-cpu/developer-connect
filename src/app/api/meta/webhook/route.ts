import { createMetaSender, metaCredentialsFromEnv, ownAccountIds } from "@/lib/social-automation/meta/client";
import { parseComments, verifyChallenge, verifySignature } from "@/lib/social-automation/meta/webhook";
import { createProcessorStore } from "@/lib/social-automation/db/postgres-automation";
import { processComment } from "@/lib/social-automation/process";

/**
 * Where Instagram and Facebook tell us about new comments.
 *
 *  - GET answers Meta's one-time subscribe handshake, and only when the verify token matches.
 *  - POST must carry a valid X-Hub-Signature-256 (HMAC of the raw body under the app secret); anything else is a 401 and is
 *    never parsed. Each new comment is handled once (a repeat delivery is only counted).
 *  - Not configured (no app secret / token in the environment): answers 503 and does nothing.
 *
 * It returns no comment, lead or configuration data. The decisions about what to send live in `processComment`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  if (!token) return new Response("Not configured.", { status: 503 });
  const challenge = verifyChallenge(new URL(request.url).searchParams, token);
  return challenge === null ? new Response("Forbidden.", { status: 403 }) : new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!secret) return new Response("Not configured.", { status: 503 });

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) return new Response("Unauthorized.", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request.", { status: 400 });
  }

  const creds = metaCredentialsFromEnv();
  const comments = parseComments(body, ownAccountIds(creds));
  const deps = { store: createProcessorStore(), meta: createMetaSender(creds), now: () => new Date() };

  let failed = 0;
  for (const comment of comments) {
    try {
      await processComment(comment, deps);
    } catch {
      // One bad comment must not stop the rest. It is counted; the stored event (if any) keeps its RECEIVED state for review.
      failed += 1;
    }
  }
  // Answer 5xx only if nothing could be processed, so Meta retries a total outage; a retry of a handled comment is a harmless duplicate.
  if (comments.length > 0 && failed === comments.length) return new Response("Temporary failure.", { status: 500 });
  return Response.json({ received: comments.length, failed });
}
