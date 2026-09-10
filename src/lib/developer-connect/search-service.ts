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
