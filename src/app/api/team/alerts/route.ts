import { getMyWorkState } from "@/lib/leads/follow-up-reads";
import { toAlertItems } from "@/lib/leads/follow-up-alerts";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getEmployee } from "@/lib/team/session";

/**
 * What needs the signed-in team member's attention right now: follow-ups that have come due and follow-ups that were missed. The scope
 * is the session's own employee, never a query parameter. It returns only an id, the lead's name and the scheduled time (no phone
 * number, no requirement, nothing about anyone else's leads). Anyone who is not an active team member gets 404.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const employee = await getEmployee();
    if (!employee) return new Response(null, { status: 404, headers: NO_STORE });
    const now = new Date();
    const work = await getMyWorkState(createPostgresLeadRepositories(), employee.actor, now);
    return Response.json({ now: now.toISOString(), items: toAlertItems(work.missed, work.dueNow, now) }, { headers: NO_STORE });
  } catch (error) {
    console.error("team alerts failed:", error);
    return new Response(null, { status: 503, headers: NO_STORE });
  }
}
