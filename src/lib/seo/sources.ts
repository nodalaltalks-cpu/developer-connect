import type { Guide } from "./types.ts";

/**
 * The regulators the guides already tell buyers to check, linked once so a reader (and a search or AI system) can see where
 * the checking is done. Only official regulator sites belong here; every link is to the regulator's own home page.
 */
export interface OfficialSource {
  name: string;
  url: string;
  /** What the reader can do there, in one short sentence. */
  use: string;
}

export const MAHARERA: OfficialSource = {
  name: "MahaRERA (Maharashtra Real Estate Regulatory Authority)",
  url: "https://maharera.maharashtra.gov.in",
  use: "Look up a project's registration and its promoter before you pay anything.",
};

export const DUBAI_LAND_DEPARTMENT: OfficialSource = {
  name: "Dubai Land Department",
  url: "https://dubailand.gov.ae/en/",
  use: "Check broker licences and property services; Dubai's property regulator, RERA, is part of the Department.",
};

export function officialSourcesFor(market: Guide["market"]): OfficialSource[] {
  if (market === "mumbai") return [MAHARERA];
  if (market === "dubai") return [DUBAI_LAND_DEPARTMENT];
  return [MAHARERA, DUBAI_LAND_DEPARTMENT];
}
