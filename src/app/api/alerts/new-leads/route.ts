import { currentUser, isFounder } from "@/lib/auth";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { endOfDayIn } from "@/lib/leads/lead-views";
import type { NewLeadItem } from "@/lib/leads/new-lead-alert";
import { getEmployee } from "@/lib/team/session";
import { assignToSoloOwner } from "@/lib/leads/solo-assignment";
import { listFounderUserIds } from "@/lib/admin-analytics/clerk-users";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

/**
 * The new-enquiry alerts. It returns the digital leads that are still NEW (nobody has contacted the buyer yet): for the Founder every
 * one, for a team member only the ones assigned to them. The scope comes from the session, never from the query. Items carry a name,
 * a developer, a time and a link, never a phone number. Anyone who is neither the Founder nor an active team member gets 404.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const user = await currentUser();
    const founder = isFounder(user);
    const employee = founder ? null : await getEmployee();
    if (!founder && !employee?.actor.actorId) return new Response(null, { status: 404, headers: NO_STORE });

    const repos = createPostgresLeadRepositories();
    const now = new Date();
    const result = await repos.leads.list({
      view: "new",
      sourceType: "DIGITAL",
      ...(founder ? {} : { ownerId: employee!.actor.actorId! }),
      limit: 10,
      offset: 0,
      now,
      endOfToday: endOfDayIn(now),
    });
    if (founder) {
      // Anything still without an owner goes to the Founder while they are the only active team member (a no-op once a team exists).
      const unowned = result.leads.filter((lead) => lead.ownerId === null && lead.returnedAt === null);
      if (unowned.length > 0) {
        const staff = createPostgresStaffRepository();
        for (const lead of unowned) await assignToSoloOwner(repos, staff, listFounderUserIds, lead.id, now).catch(() => null);
      }
    }
    const developerIds = [...new Set(result.leads.flatMap((l) => (l.developerId ? [l.developerId] : [])))];
    const names = developerIds.length ? await repos.leads.developerNames(developerIds) : {};
    const items: NewLeadItem[] = result.leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      developer: lead.developerId ? (names[lead.developerId] ?? null) : null,
      createdAt: lead.createdAt.toISOString(),
      href: founder ? `/admin/leads/${lead.id}` : `/team/leads/${lead.id}`,
    }));
    return Response.json({ now: now.toISOString(), total: result.total, items }, { headers: NO_STORE });
  } catch (error) {
    console.error("new-lead alerts failed:", error);
    return new Response(null, { status: 503, headers: NO_STORE });
  }
}
