import { approvedLocationPages, locationPath } from "@/lib/developer-connect/location-pages";
import { BUY_DIRECT_PATH, buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";

const BASE_URL = "https://developerconnects.com";

/**
 * /llms.txt — a plain-Markdown summary of the site for AI assistants and
 * AI search engines (the llms.txt convention), so a model answering "how do
 * I research a developer in Dubai?" or "what is X developer's
 * official website?" can find and cite the right pages. Built from the same
 * allowlists as the sitemap, so it never lists a page that doesn't exist.
 */
export function GET() {
  const locations = approvedLocationPages()
    .map((location) => `- [Real estate developers in ${location.phrase}](${BASE_URL}${locationPath(location)})`)
    .join("\n");
  const guides = buyDirectMarkets()
    .map((market) => `- [Developer research guide: ${market.name}](${BASE_URL}${buyDirectPath(market)})`)
    .join("\n");

  const body = `# Developer Connects

> Developer Connects is a property advisory platform for buyers in Mumbai, Dubai and across India and the UAE. Buyers can compare leading real estate developers and projects, and share a WhatsApp number or phone so the Developer Connects advisory team can help them based on their requirement. Developer Connects is not the developer of any project.

Each developer page is at ${BASE_URL}/developers/{developer-slug} and states the developer's name and location and lets a buyer request a connection through the advisory team. Developer Connects does not certify a developer's legal status, licences, regulatory approvals or project quality; buyers should confirm these with the developer and the regulator.

## Key pages

- [Home and search](${BASE_URL}/)
- [All developers (A–Z)](${BASE_URL}/developers)
- [How to research a developer before you buy](${BASE_URL}${BUY_DIRECT_PATH})
- [FAQ](${BASE_URL}/faq)
- [About](${BASE_URL}/about)

## Developers by location

${locations}

## Developer research guides by location

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
