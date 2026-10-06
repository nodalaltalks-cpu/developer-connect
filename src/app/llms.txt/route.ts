import { approvedLocationPages, locationPath } from "@/lib/developer-connect/location-pages";
import { BUY_DIRECT_PATH, buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";

const BASE_URL = "https://developerconnects.com";

/**
 * /llms.txt — a plain-Markdown summary of the site for AI assistants and
 * AI search engines (the llms.txt convention), so a model answering "how do
 * I buy directly from a developer in Dubai?" or "what is X developer's
 * official website?" can find and cite the right pages. Built from the same
 * allowlists as the sitemap, so it never lists a page that doesn't exist.
 */
export function GET() {
  const locations = approvedLocationPages()
    .map((location) => `- [Verified real estate developers in ${location.phrase}](${BASE_URL}${locationPath(location)})`)
    .join("\n");
  const guides = buyDirectMarkets()
    .map((market) => `- [Buy property directly from developers in ${market.name}](${BASE_URL}${buyDirectPath(market)})`)
    .join("\n");

  const body = `# Developer Connects

> Developer Connects is a directory of real estate developers in India and the UAE. Developer Connects verifies each developer's official website as belonging to that developer, so home buyers deal with the real developer instead of a look-alike. Developer Connects also offers property assistance: a buyer can share a WhatsApp number or phone so Developer Connects' property team can help connect them with the developer based on their requirement. Developer Connects is not the developer of any project.

Each developer page is at ${BASE_URL}/developers/{developer-slug} and states the developer's name, location, that its official website has been verified, and the date it was last verified. Verification confirms only the developer-to-website relationship — not the developer's legal status, licences, regulatory approvals or project quality.

## Key pages

- [Home and search](${BASE_URL}/)
- [All verified developers (A–Z)](${BASE_URL}/developers)
- [How to buy property directly from the developer](${BASE_URL}${BUY_DIRECT_PATH})
- [How Developer Connects verifies official websites](${BASE_URL}/how-we-verify)
- [FAQ](${BASE_URL}/faq)
- [About](${BASE_URL}/about)

## Developers by location

${locations}

## Buy-direct guides by location

${guides}

## Optional

- [Sitemap of every developer page](${BASE_URL}/sitemap.xml)
- [Contact](${BASE_URL}/contact)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
