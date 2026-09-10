import type { DeveloperRepository } from "./repository.ts";
import { makeUniqueSlug, slugify } from "./slug.ts";
import type { Developer } from "./types.ts";

export interface CreateDeveloperInput {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export async function createDeveloper(
  developers: DeveloperRepository,
  input: CreateDeveloperInput,
): Promise<Developer> {
  const legalName = input.legalName.trim();
  const displayName = input.displayName.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const country = input.country.trim();

  if (!legalName || !displayName || !city || !state || !country) {
    throw new Error("legalName, displayName, city, state, and country are required");
  }

  const slug = await makeUniqueSlug(displayName, (candidate) => developers.slugExists(candidate));

  return developers.create({
    legalName,
    displayName,
    slug,
    city,
    state,
    country,
    headquartersLocation: input.headquartersLocation?.trim() || undefined,
  });
}

/**
 * Deterministic, non-fuzzy duplicate check for Founder-driven intake: an
 * existing developer whose display name or legal name normalizes (via the
 * same `slugify` used for slug generation — lowercased, diacritics and
 * punctuation stripped, whitespace collapsed) to the same value as the
 * proposed one.
 *
 * LIMITATION, by design: this only catches exact-normalized-name matches
 * ("Lodha Group" vs "lodha   group" vs "Lodha, Group"). It will NOT catch
 * two differently-worded names for the same real company ("Lodha Group"
 * vs "Lodha Developers Pvt Ltd") — that requires human judgment, not an
 * automated check, so this deliberately does not attempt fuzzy matching.
 *
 * Does not itself block anything — `createDeveloper`'s existing contract
 * and tests (two developers may share a display name, distinguished only
 * by slug suffix) are left untouched. Callers that want to block on a
 * likely duplicate (the Founder intake Server Action) must call this
 * first and decide what to do with the result themselves.
 */
export async function findLikelyDuplicateDeveloper(
  developers: DeveloperRepository,
  input: { legalName: string; displayName: string },
): Promise<Developer | null> {
  const displaySlug = slugify(input.displayName.trim());
  const legalSlug = slugify(input.legalName.trim());

  // displayName duplicates: a developer's slug is always derived from its
  // displayName (see makeUniqueSlug above), so this reuses the existing
  // slug lookup directly — no new repository surface needed.
  if (displaySlug) {
    const byDisplayName = await developers.getBySlug(displaySlug);
    if (byDisplayName) return byDisplayName;
  }

  // legalName duplicates: legalName isn't reflected in the slug, so it's
  // compared directly (normalized the same way) against every existing
  // developer. Fine at this scale — the first 15-20 developers — and
  // still a small, transparent, deterministic check, not a search index.
  if (legalSlug) {
    const all = await developers.list();
    const byLegalName = all.find((d) => slugify(d.legalName) === legalSlug);
    if (byLegalName) return byLegalName;
  }

  return null;
}
