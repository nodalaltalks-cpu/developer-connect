import type { MetadataRoute } from "next";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { listVerifiedDevelopers } from "@/lib/developer-connect/search-service";

const BASE_URL = "https://developerconnects.com";

/**
 * `export const revalidate = 3600` was tried here first and did NOT work
 * in production: this route makes no `fetch()` call and reads no
 * Request-time API, so Next.js treated it as fully static and only ever
 * rendered it once, at build/deploy time — the `revalidate` route-segment
 * config never re-triggered a background regeneration for it. Verified
 * against the live site: the newest `<lastmod>` in the deployed sitemap
 * matched exactly the count of published developers AT THE MOMENT OF THE
 * LAST DEPLOY (624), while the database had grown to 1,201 published
 * developers days later — the sitemap was frozen, silently missing more
 * than half the directory from Google's crawl.
 *
 * `force-dynamic` makes this route re-run its database query on every
 * request instead, guaranteeing it always reflects the current published
 * directory. The cost is one already-optimized query (a single batched
 * `getManyByIds`, not one query per developer — see
 * fetchAllVerifiedProfiles) on the comparatively rare requests this route
 * gets (crawlers and monitoring, not real visitors).
 */
export const dynamic = "force-dynamic";

/**
 * Public, indexable static pages — deliberately excludes /admin,
 * /profile, and /post-sign-in, which are already noindex and require
 * authentication. Includes /developers (the crawlable A-Z index) but
 * deliberately NOT its own ?page=N pagination — those are reachable by
 * following its real <a> links, exactly how a crawler is meant to find
 * paginated scaffolding; the sitemap should list destination content, not
 * every intermediate listing page.
 */
const STATIC_ROUTES = ["/", "/developers", "/about", "/contact", "/faq", "/privacy", "/terms", "/cookies", "/disclaimer"];

/**
 * Dynamic sitemap (App Router convention — this file's default export is
 * automatically served at /sitemap.xml). Developer URLs come from
 * listVerifiedDevelopers, the exact same VERIFIED-and-ACTIVE-only query
 * the public homepage/search/directory already use — never a separate
 * or looser query, so the sitemap can never list a developer the public
 * site itself wouldn't show.
 *
 * `priority`/`changeFrequency` are deliberately omitted: Google has
 * documented for years that it ignores both, so setting them adds runtime
 * cost with zero actual effect on crawling or ranking.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repos = createPostgresRepositories();
  const verifiedDevelopers = await listVerifiedDevelopers(repos);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
  }));

  const developerEntries: MetadataRoute.Sitemap = verifiedDevelopers.map((developer) => ({
    url: `${BASE_URL}/developers/${developer.slug}`,
    lastModified: developer.officialWebsite?.verifiedAt,
  }));

  return [...staticEntries, ...developerEntries];
}
