import type { MetadataRoute } from "next";

const BASE_URL = "https://developerconnects.com";

/**
 * Dynamic robots.txt (App Router convention — served at /robots.txt).
 * Disallows only the routes that are already private/authenticated
 * (/admin, /profile, /post-sign-in — see their own `robots: {index:
 * false}` metadata) so a crawler never wastes budget on pages it would
 * get a 404 or a redirect-to-sign-in from anyway. Everything else,
 * including every /developers/[slug] page, stays crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/profile", "/post-sign-in"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
