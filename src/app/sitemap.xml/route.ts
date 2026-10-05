import { buildSitemapEntries } from "@/lib/sitemap-entries";

/**
 * /sitemap.xml as a route handler (not the sitemap.ts metadata convention)
 * so it can set its own Cache-Control. Building the sitemap reads the whole
 * published directory and takes several seconds, which made Google Search
 * Console report "Couldn't fetch". The Vercel CDN now serves a cached copy —
 * fresh for an hour, then stale-while-revalidate so a crawler never waits
 * on a rebuild — while the sitemap still follows the live directory.
 * `force-dynamic` keeps the underlying build reading the database (see the
 * note in sitemap-entries.ts about a frozen, build-time sitemap).
 */
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const entries = await buildSitemapEntries();
  const urls = entries
    .map((entry) => {
      const lastModified = entry.lastModified ? new Date(entry.lastModified).toISOString() : null;
      return `<url><loc>${escapeXml(entry.url)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ""}</url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
