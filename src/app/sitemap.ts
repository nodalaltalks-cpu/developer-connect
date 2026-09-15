import type { MetadataRoute } from "next";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { listVerifiedDevelopers } from "@/lib/developer-connect/search-service";

const BASE_URL = "https://developerconnects.com";

/**
 * Without this, Next.js would statically generate this sitemap once at
 * build time and serve that same snapshot until the next deploy — so a
 * developer verified an hour after a deploy would be invisible to
 * crawlers indefinitely. Revalidating hourly keeps it reflecting real,
 * current database state without hitting the database on every single
 * crawler request.
 */
export const revalidate = 3600;

/** Public, indexable static pages — deliberately excludes /admin, /profile, and /post-sign-in, which are already noindex and require authentication. */
const STATIC_ROUTES = ["/", "/about", "/contact", "/faq", "/privacy", "/terms", "/cookies", "/disclaimer"];

/**
 * Dynamic sitemap (App Router convention — this file's default export is
 * automatically served at /sitemap.xml). Developer URLs come from
 * listVerifiedDevelopers, the exact same VERIFIED-and-ACTIVE-only query
 * the public homepage/search/directory already use — never a separate
 * or looser query, so the sitemap can never list a developer the public
 * site itself wouldn't show.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repos = createPostgresRepositories();
  const verifiedDevelopers = await listVerifiedDevelopers(repos);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));

  const developerEntries: MetadataRoute.Sitemap = verifiedDevelopers.map((developer) => ({
    url: `${BASE_URL}/developers/${developer.slug}`,
    lastModified: developer.officialWebsite?.verifiedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...developerEntries];
}
