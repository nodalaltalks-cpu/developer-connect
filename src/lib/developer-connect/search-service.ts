import type { DeveloperConnectRepositories } from "./repository.ts";
import { toPublicDeveloperProfile, type PublicDeveloperProfile } from "./public-view.ts";

const MAX_RESULTS = 20;

/** Trims and collapses internal whitespace so "  Lodha   Group " behaves like "Lodha Group". */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Public developer search. Only developers with a VERIFIED website
 * candidate are returned — an unverified developer is not yet something
 * Developer Connect can send a user to, so it is not a search result,
 * even if the name matches. (Its page still exists and is reachable
 * directly by slug — see getPublicDeveloperBySlug.)
 */
export async function searchPublicDevelopers(
  repos: DeveloperConnectRepositories,
  rawQuery: string,
): Promise<PublicDeveloperProfile[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return [];

  const matches = await repos.developers.search(query, MAX_RESULTS);

  const results: PublicDeveloperProfile[] = [];
  for (const developer of matches) {
    const verified = await repos.candidates.getVerifiedForDeveloper(developer.id);
    if (verified) {
      results.push(toPublicDeveloperProfile(developer, verified));
    }
  }
  return results;
}

/**
 * Every publicly VERIFIED developer, for the homepage directory listing —
 * the exact same VERIFIED-only boundary as searchPublicDevelopers, just
 * not gated behind a query. Deliberately a separate function rather than
 * making searchPublicDevelopers("") return everything: an empty query
 * returning "no results" there is an existing, intentional guarantee (see
 * search-service.test.ts) for the live search box, which is a different
 * surface from "show the whole directory by default".
 *
 * Iterates over VERIFIED candidates (via the existing listByStatuses,
 * already used for the founder's review queue) rather than over every
 * developer — this directory's cost scales with how many developers are
 * actually shown, not with however many developer rows exist in total
 * (most of which are unverified and never rendered here).
 *
 * Ordered alphabetically by display name for a stable, predictable
 * listing — listByStatuses's own ordering (newest-verified-first) isn't
 * meaningful to a first-time visitor scanning for a name they recognize.
 */
export async function listVerifiedDevelopers(
  repos: DeveloperConnectRepositories,
): Promise<PublicDeveloperProfile[]> {
  const verifiedCandidates = await repos.candidates.listByStatuses(["VERIFIED"]);

  // Fetched concurrently rather than awaited one at a time in the loop —
  // each lookup is an independent round trip, and a real remote database
  // connection's per-round-trip latency (not query cost) dominates here,
  // so awaiting them sequentially would make wall-clock time scale
  // linearly with the number of verified developers instead of staying
  // roughly constant.
  const withDevelopers = await Promise.all(
    verifiedCandidates.map(async (candidate) => ({
      candidate,
      developer: await repos.developers.getById(candidate.developerId),
    })),
  );

  const results: PublicDeveloperProfile[] = [];
  for (const { candidate, developer } of withDevelopers) {
    if (developer && developer.status === "ACTIVE") {
      results.push(toPublicDeveloperProfile(developer, candidate));
    }
  }
  return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Looks up a single developer for its public page. Returns null for a
 * developer that doesn't exist OR isn't ACTIVE — both cases should read
 * as "not found" to a public visitor, not be distinguished. Unlike
 * search, this deliberately returns developers with no verified website
 * too, so the page can show its own honest "not yet verified" state.
 */
export async function getPublicDeveloperBySlug(
  repos: DeveloperConnectRepositories,
  slug: string,
): Promise<PublicDeveloperProfile | null> {
  const developer = await repos.developers.getBySlug(slug);
  if (!developer || developer.status !== "ACTIVE") return null;

  const verified = await repos.candidates.getVerifiedForDeveloper(developer.id);
  return toPublicDeveloperProfile(developer, verified);
}
