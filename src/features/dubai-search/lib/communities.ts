/**
 * The Dubai communities the search covers. Only plain, well-known description is written here: no prices, yields, rankings or
 * predictions. The portal slugs were each checked by opening the portal's own page in a browser on 2026-11-22; a slug that
 * the portal did not recognise is not listed.
 */
export interface Community {
  id: string;
  name: string;
  /** Short name buyers type. */
  short?: string;
  /** Two plain sentences about the area. */
  about: string;
  bayutSlug: string;
  propertyFinderSlug: string;
  /** Villas and townhouses are only offered where both portals have the page (checked). */
  villas: boolean;
  townhouses: boolean;
  /** Pages for individual bedroom counts are indexed only for the four most-searched communities. */
  indexBedroomPages: boolean;
}

export const COMMUNITIES_REVIEWED = "2026-11-22";

export const COMMUNITIES: readonly Community[] = [
  {
    id: "jumeirah-village-circle",
    name: "Jumeirah Village Circle",
    short: "JVC",
    about: "A large residential community in central Dubai, laid out in numbered districts around circular parks. It has many mid-rise apartment buildings, a mix of ready and off-plan projects, and a wide spread of prices.",
    bayutSlug: "jumeirah-village-circle-jvc",
    propertyFinderSlug: "jumeirah-village-circle",
    villas: false,
    townhouses: false,
    indexBedroomPages: true,
  },
  {
    id: "dubai-marina",
    name: "Dubai Marina",
    about: "A waterfront district built around an artificial canal, with high-rise towers, a promenade and a marina. It sits beside JBR and is served by the Dubai Metro and the Dubai Tram.",
    bayutSlug: "dubai-marina",
    propertyFinderSlug: "dubai-marina",
    villas: false,
    townhouses: false,
    indexBedroomPages: true,
  },
  {
    id: "downtown-dubai",
    name: "Downtown Dubai",
    about: "The central district around the Burj Khalifa and The Dubai Mall, mostly high-rise apartments and serviced residences. It is one of the most recognised addresses in the city.",
    bayutSlug: "downtown-dubai",
    propertyFinderSlug: "downtown-dubai",
    villas: false,
    townhouses: false,
    indexBedroomPages: true,
  },
  {
    id: "business-bay",
    name: "Business Bay",
    about: "A mixed commercial and residential district along the Dubai Canal, next to Downtown Dubai. Most homes are apartments in towers, from studios to larger layouts.",
    bayutSlug: "business-bay",
    propertyFinderSlug: "business-bay",
    villas: false,
    townhouses: false,
    indexBedroomPages: true,
  },
  {
    id: "palm-jumeirah",
    name: "Palm Jumeirah",
    about: "A man-made, palm-shaped island off the Dubai coast. It has apartment buildings along the trunk and individual villas on the fronds.",
    bayutSlug: "palm-jumeirah",
    propertyFinderSlug: "palm-jumeirah",
    villas: true,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "jumeirah-lake-towers",
    name: "Jumeirah Lake Towers",
    short: "JLT",
    about: "A cluster of towers arranged around artificial lakes, beside Dubai Marina. It mixes residential and office buildings.",
    bayutSlug: "jumeirah-lake-towers-jlt",
    propertyFinderSlug: "jumeirah-lake-towers",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "dubai-hills-estate",
    name: "Dubai Hills Estate",
    about: "A master-planned community with a golf course, developed by Emaar and Meraas. It has apartments, townhouses and villas.",
    bayutSlug: "dubai-hills-estate",
    propertyFinderSlug: "dubai-hills-estate",
    villas: true,
    townhouses: true,
    indexBedroomPages: false,
  },
  {
    id: "arjan",
    name: "Arjan",
    about: "An apartment-focused residential community in inland Dubai, with mid-rise buildings and a mix of ready and off-plan projects.",
    bayutSlug: "arjan",
    propertyFinderSlug: "arjan",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "dubai-sports-city",
    name: "Dubai Sports City",
    about: "A sports-themed community in Dubailand with stadiums and training facilities, and mid-rise apartment buildings around them.",
    bayutSlug: "dubai-sports-city",
    propertyFinderSlug: "dubai-sports-city",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "al-furjan",
    name: "Al Furjan",
    about: "A residential community in the south-west of Dubai with apartments and townhouses, and a Dubai Metro station.",
    bayutSlug: "al-furjan",
    propertyFinderSlug: "al-furjan",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "dubai-south",
    name: "Dubai South",
    about: "A large master-planned area around Al Maktoum International Airport (Dubai World Central), close to Expo City Dubai.",
    bayutSlug: "dubai-south",
    propertyFinderSlug: "dubai-south",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
  {
    id: "jumeirah-beach-residence",
    name: "Jumeirah Beach Residence",
    short: "JBR",
    about: "A beachfront community of residential towers along The Walk, next to Dubai Marina.",
    bayutSlug: "jumeirah-beach-residence-jbr",
    propertyFinderSlug: "jumeirah-beach-residence",
    villas: false,
    townhouses: false,
    indexBedroomPages: false,
  },
];

export function getCommunity(id: string): Community | undefined {
  return COMMUNITIES.find((c) => c.id === id);
}

export function communityLabel(c: Community): string {
  return c.short ? `${c.name} (${c.short})` : c.name;
}
