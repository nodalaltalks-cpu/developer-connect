import { currentUser } from "@/lib/auth";
import { isFounder } from "@/lib/authorization";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getEmployee } from "@/lib/team/session";

/**
 * The live-update cursor. It returns ONE number: the newest event position the signed-in person is allowed to see. The browser
 * compares it with the last one it saw and, when it moved, asks the server to re-render the page. No lead data, no event content
 * and no names ever travel through here, so there is nothing to leak beyond "something changed".
 *
 * Scope is decided on the server from the session, never from the query: the Founder sees every event, a team member only events on
 * their own leads or their own actions, anyone else gets 404.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const user = await currentUser();
    if (user && isFounder(user)) {
      const cursor = await createPostgresLeadRepositories().events.latestSeq({});
      return Response.json({ cursor }, { headers: NO_STORE });
    }
    const employee = user ? await getEmployee() : null;
    if (employee?.actor.actorId) {
      const cursor = await createPostgresLeadRepositories().events.latestSeq({ personId: employee.actor.actorId });
      return Response.json({ cursor }, { headers: NO_STORE });
    }
  } catch (error) {
    console.error("live cursor failed:", error);
    return new Response(null, { status: 503, headers: NO_STORE });
  }
  return new Response(null, { status: 404, headers: NO_STORE });
}
