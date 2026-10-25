import { unstable_cache } from "next/cache";
import { createPostgresRepositories } from "./db/postgres-repository";
import { getPublicDeveloperBySlug, getPublicDirectoryPage, listRelatedVerifiedDevelopers } from "./search-service";

/**
 * The public directory reads, remembered for a few minutes between visitors.
 *
 * Why: the database only goes to sleep when nothing asks it anything for a few minutes. Every public page view (and every
 * search-engine or AI crawler hit) used to ask it again, so it was awake around the clock. Remembering the answer for
 * CACHE_SECONDS means the same page seen by many visitors costs one query, and the database can sleep in between.
 *
 * What a visitor sees does not change: these are the same public, non-personal results, at most CACHE_SECONDS old (a
 * developer edit shows up within five minutes). Nothing personal is cached here: no sign-in, no recently-viewed list, no
 * session. Every value is plain data (no dates), so it survives being stored.
 */
const CACHE_SECONDS = 300;
const TAG = "public-developers";

export const cachedPublicDeveloperBySlug = unstable_cache(
  async (slug: string) => getPublicDeveloperBySlug(createPostgresRepositories(), slug),
  ["public-developer-by-slug"],
  { revalidate: CACHE_SECONDS, tags: [TAG] },
);

export const cachedPublicDirectoryPage = unstable_cache(
  async (country: string | undefined, city: string | undefined, cityAliases: string, offset: number, pageSize: number) =>
    getPublicDirectoryPage(createPostgresRepositories(), { country, city, cityAliases: cityAliases ? cityAliases.split("|") : undefined }, offset, pageSize),
  ["public-directory-page"],
  { revalidate: CACHE_SECONDS, tags: [TAG] },
);

export const cachedRelatedDevelopers = unstable_cache(
  async (id: string, city: string, country: string) => listRelatedVerifiedDevelopers(createPostgresRepositories(), { id, city, country }),
  ["public-related-developers"],
  { revalidate: CACHE_SECONDS, tags: [TAG] },
);
