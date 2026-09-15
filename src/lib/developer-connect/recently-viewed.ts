import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db/client.ts";
import { analyticsEvents } from "./db/schema.ts";
import type { DeveloperConnectRepositories } from "./repository.ts";
import { toPublicDeveloperProfile, type PublicDeveloperProfile } from "./public-view.ts";

const DEFAULT_LIMIT = 5;

/**
 * "Continue your research" (Part 8/9) — reuses the EXISTING
 * developer_page_viewed analytics events (recorded by
 * DeveloperPageViewTracker on every real page view) as the entire data
 * source. No new table, no new client-side storage: a signed-in user's
 * history is looked up by their real userId (works across devices/
 * sessions, for as long as analytics events are retained); an anonymous
 * visitor's is looked up by the same anonymous session cookie every other
 * public analytics event already uses.
 *
 * Never shows a developer that isn't public anymore — the events table
 * doesn't know or care about later unpublish/reject decisions, so every
 * id is re-checked against the current VERIFIED+ACTIVE state before
 * being returned, exactly like every other public listing.
 */
export async function getRecentlyViewedDevelopers(
  repos: DeveloperConnectRepositories,
  identity: { userId?: string; sessionId?: string },
  limit = DEFAULT_LIMIT,
): Promise<PublicDeveloperProfile[]> {
  if (!identity.userId && !identity.sessionId) return [];

  const db = getDb();
  const identityCondition = identity.userId
    ? eq(analyticsEvents.userId, identity.userId)
    : eq(analyticsEvents.sessionId, identity.sessionId!);

  // Most recent view per distinct developer — a developer viewed 5 times
  // today should appear once, at its most recent view time, not crowd
  // out everything else.
  const rows = await db
    .select({
      developerId: analyticsEvents.developerId,
      lastViewedAt: sql<string>`max(${analyticsEvents.occurredAt})`,
    })
    .from(analyticsEvents)
    .where(
      and(eq(analyticsEvents.eventName, "developer_page_viewed"), identityCondition, sql`${analyticsEvents.developerId} is not null`),
    )
    .groupBy(analyticsEvents.developerId)
    .orderBy(desc(sql`max(${analyticsEvents.occurredAt})`))
    .limit(limit * 2); // headroom: some may no longer be publicly verified by the time we filter below

  const developerIds = rows.map((r) => r.developerId).filter((id): id is string => Boolean(id));
  if (developerIds.length === 0) return [];

  const [developers, candidates] = await Promise.all([
    repos.developers.getManyByIds(developerIds),
    Promise.all(developerIds.map((id) => repos.candidates.getVerifiedForDeveloper(id))),
  ]);
  const developerById = new Map(developers.map((d) => [d.id, d]));
  const verifiedById = new Map(developerIds.map((id, i) => [id, candidates[i]]));

  const orderedIds = rows.map((r) => r.developerId!).filter(Boolean);
  const profiles: PublicDeveloperProfile[] = [];
  for (const id of orderedIds) {
    const developer = developerById.get(id);
    const verified = verifiedById.get(id);
    if (developer && developer.status === "ACTIVE" && verified) {
      profiles.push(toPublicDeveloperProfile(developer, verified));
    }
    if (profiles.length >= limit) break;
  }
  return profiles;
}
