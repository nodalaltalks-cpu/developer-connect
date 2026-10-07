import { createHash, timingSafeEqual } from "node:crypto";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { runAutomations } from "@/lib/leads/automation-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

/**
 * The scheduled entry point of the sales automation engine (reminders, stale-lead alerts, optional routing).
 *
 *  - NOT CONFIGURED: with no CRON_SECRET set the route answers 503 and does nothing, so it can never run by accident.
 *  - AUTHENTICATED: the caller must send `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does this automatically).
 *    The comparison is constant-time. Anything else is 401 and runs nothing.
 *  - SAFE TO REPEAT: the engine is idempotent (each action is claimed once), so a duplicate or concurrent call
 *    does no harm.
 *  - NOTHING LEAKS: the response is counts only - no lead, buyer, employee or notification content.
 *
 * Public by necessity (a scheduler is not signed in), which is exactly why it trusts only the secret.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare digests so the comparison is constant-time and length-independent.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Automation is not configured.", { status: 503 });
  if (!authorized(request, secret)) return new Response("Unauthorized.", { status: 401 });
  try {
    const summary = await runAutomations(createPostgresLeadRepositories(), createPostgresStaffRepository(), createLeadNotifier(createPostgresNotificationRepository()), new Date());
    return Response.json({ ranAt: summary.ranAt.toISOString(), results: summary.results });
  } catch {
    return new Response("The run failed.", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
