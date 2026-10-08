import type { Market } from "./hero-market.ts";

/**
 * FEATURED DEVELOPERS: a short, curated entry point into the directory for each market. This is NOT a ranking and is never
 * presented as one: each market lists its names alphabetically, and the page says how they were chosen.
 *
 * Selection basis (reviewed 2026-10-08 against public reporting; no figure from these sources is displayed, because the
 * published rankings use different periods and methods and disagree with one another):
 *  - Mumbai / MMR: developers with long-standing, large residential footprints in the Mumbai Metropolitan Region, drawn from
 *    published FY25/FY26 sales reporting and company disclosures (Godrej Properties, Lodha, Oberoi Realty, Kalpataru,
 *    Rustomjee, K Raheja Corp).
 *  - Dubai: developers consistently at the top of 2025 Dubai sales by value and by number of deals in published market
 *    reporting (Emaar, DAMAC, Binghatti, Nakheel, Sobha Realty, Meraas).
 *
 * A featured developer only appears if it is an ACTIVE public developer in the directory, so this list can never put an unlisted
 * company in front of a buyer. Logos are shown ONLY when an official asset has been placed in /public/developers/logos and named
 * here; until then the name is set in type (no redrawn or invented marks).
 *
 * To change the list, edit it here and keep the test green. Nothing else needs to know the names.
 */

export interface FeaturedDeveloper {
  slug: string;
  market: Market;
  /** Path under /public of an OFFICIAL logo file, once one has been obtained and cleared for use. */
  logo?: string;
}

export const FEATURED_DEVELOPERS: readonly FeaturedDeveloper[] = [
  { slug: "godrej-properties", market: "mumbai" },
  { slug: "k-raheja-corp", market: "mumbai" },
  { slug: "kalpataru", market: "mumbai" },
  { slug: "lodha", market: "mumbai" },
  { slug: "oberoi-realty", market: "mumbai" },
  { slug: "rustomjee", market: "mumbai" },
  { slug: "binghatti-developers", market: "dubai" },
  { slug: "damac-properties", market: "dubai" },
  { slug: "emaar-properties", market: "dubai" },
  { slug: "meraas", market: "dubai" },
  { slug: "nakheel", market: "dubai" },
  { slug: "sobha-realty", market: "dubai" },
] as const;

export const FEATURED_SELECTION_NOTE =
  "Selected for market presence and project footprint in each city, from published market reporting. Listed alphabetically. This is not a ranking, and a developer’s appearance here is not an endorsement by or of either party.";

export function featuredFor(market: Market): FeaturedDeveloper[] {
  return FEATURED_DEVELOPERS.filter((d) => d.market === market);
}
