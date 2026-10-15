import type { Guide } from "./types.ts";
import { CORE_DUBAI, dubaiArea } from "./guides-areas-more.ts";

/**
 * Dubai micro-location guides: the communities buyers name once they have narrowed a search ("Motor City apartments", "Dubai South
 * for investment"). Same rules as the other neighbourhood guides: character, the kind of homes, how the area connects and what to
 * check, never a price, rent, yield or growth figure, and anything still being built is described as such.
 */
export const DUBAI_MICRO_GUIDES: readonly Guide[] = [
  dubaiArea({
    slug: "buying-property-in-dubai-south",
    area: "Dubai South",
    name: "Dubai South",
    hook: "the airport-side district and Expo City",
    summary:
      "Dubai South is a large, planned district around Al Maktoum International Airport and Expo City, in the south-west of the emirate, with residential communities, logistics and aviation business parks. It suits buyers with a long horizon who accept that much of the district is still being built and that the commute to central Dubai is long.",
    why: "The district was planned around the airport and the Expo site, with housing, offices and logistics in one master plan. For that reason it is more of a long-term story than a finished neighbourhood, and phases differ greatly in how complete they are.",
    whyPoints: ["Planned around Al Maktoum International Airport and Expo City.", "Residential communities with parks and community retail.", "Business and logistics zones close to homes.", "Lower entry points than the central districts."],
    homes: "Townhouses, villas and apartments in master-planned residential clusters, mostly new and off-plan, with a smaller ready and resale market. Handover dates depend on the project, so the developer's record matters.",
    connects: "Dubai South is reached along Sheikh Mohammed bin Zayed Road and Emirates Road, and Expo City has a metro station on the Red Line extension. The airport's passenger operations have been planned to expand in stages; check what is open today rather than the brochure.",
    checks: ["Which phase is built and which is still a construction site.", "The commute to where you actually work.", "Schools, clinics and shops open now, not planned.", "Registration and escrow account of any off-plan project."],
    faq: [
      { question: "Is Dubai South ready to live in?", answer: "Parts of it are, and much is still being built. Visit the specific phase, and ask what is open nearby before you decide." },
      { question: "Is Dubai South freehold?", answer: "Residential communities sold to foreign buyers are in designated freehold areas, but confirm the status of the specific project with the Dubai Land Department." },
    ],
    related: ["buying-property-in-al-furjan-dubai", "buying-property-in-town-square-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-dubai-silicon-oasis",
    area: "Dubai Silicon Oasis",
    name: "Dubai Silicon Oasis",
    hook: "the technology-park community",
    summary:
      "Dubai Silicon Oasis is a technology-park community in the east of Dubai, governed by its own authority, with apartment buildings, schools and a business park for technology firms. It suits buyers who want a practical, mid-market address with a settled community and an easier entry point than the waterfront districts.",
    why: "Dubai Silicon Oasis grew around a technology and free-zone park, so the neighbourhood has offices, schools, a hospital and shopping already working. It is often chosen for the balance between price, space and a lived-in feel.",
    whyPoints: ["A technology park and free zone on the doorstep.", "Established schools, hospital and shopping.", "Apartments and some townhouses in a planned layout.", "Close to Mirdif and Al Warqa."],
    homes: "Mid-rise apartment buildings dominate, from studios to larger flats, with townhouse clusters in newer parts. Most stock is ready and resale, with some new launches.",
    connects: "The district sits near Sheikh Mohammed bin Zayed Road and Emirates Road; there is no metro inside it, so most residents drive or use feeder transport. Check your own commute first.",
    checks: ["Because the district has its own authority, confirm the ownership type and any charges with the Dubai Land Department and the authority.", "Service charges for the specific building.", "The distance from your unit to schools and the main roads.", "Building age and maintenance record."],
    faq: [
      { question: "Can Indians buy in Dubai Silicon Oasis?", answer: "Foreign buyers can purchase in designated parts of the district, but the ownership type depends on the project, so confirm it with the Dubai Land Department and the authority." },
      { question: "Is Dubai Silicon Oasis far from central Dubai?", answer: "It is a drive away from Downtown and the Marina; peak-hour traffic on the main roads is the main trade-off." },
    ],
    related: ["buying-property-in-mirdif-dubai", "buying-property-in-dubai-sports-city", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-mohammed-bin-rashid-city",
    area: "Mohammed Bin Rashid City",
    name: "Mohammed Bin Rashid City",
    metaName: "MBR City",
    hook: "the park-and-lagoon district",
    summary:
      "Mohammed Bin Rashid City, often called MBR City, is a large master-planned district east of Downtown Dubai, planned around parks, lagoons and a racecourse, with several residential communities inside it. It suits buyers who want a green, central address close to Downtown with newer homes, and who accept that phases are being delivered over time.",
    why: "MBR City combines nearness to Downtown and Business Bay with open space and low-density planning, which is rare so close to the centre. Because it is made of several communities, you are really choosing a neighbourhood within it.",
    whyPoints: ["A short drive to Downtown and Business Bay.", "Parks, lagoons and low-density planning.", "Villas, townhouses and apartments in separate communities.", "Retail and leisure within the district."],
    homes: "Villas and townhouses in the low-rise communities, apartments in the mid- and high-rise clusters. Much of the supply is off-plan or recent, with a growing resale market.",
    connects: "The district sits between Sheikh Zayed Road, Al Khail Road and Ras Al Khor Road, so Downtown and the airport are a short drive. Check which parts have shops, schools and amenities open today.",
    checks: ["Which community inside the district you are in, as they differ widely.", "The handover date and the developer's earlier deliveries.", "Service and community charges.", "Construction still going on around your block."],
    faq: [
      { question: "Is MBR City close to Downtown Dubai?", answer: "Yes, parts of it are only a few minutes' drive. Test your own route at peak hours." },
      { question: "Is MBR City good for families?", answer: "Many communities are designed with parks and low-rise homes for families. Check the schools and clinics that are open now." },
    ],
    related: ["buying-property-in-dubai-hills-estate", "buying-property-in-dubai-creek-harbour", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-dubai-harbour",
    area: "Dubai Harbour",
    name: "Dubai Harbour",
    hook: "the marina district by the Palm",
    summary:
      "Dubai Harbour is a waterfront development at the entrance of Palm Jumeirah, with a large marina, a cruise terminal and a mix of towers and low-rise residences. It suits buyers who want a new, sea-facing address close to Palm Jumeirah and Dubai Marina, with the understanding that phases are still being delivered.",
    why: "The district is designed around the water: a marina, a promenade and views towards Palm Jumeirah and the open sea. It is next to Bluewaters Island and a short drive from the Marina and the beach.",
    whyPoints: ["A large marina and promenade.", "Views towards Palm Jumeirah and the sea.", "Close to Bluewaters, the Marina and the beach.", "New towers with hotel-style amenities."],
    homes: "Apartments in new towers, from compact to larger units, with some branded residences and a limited number of low-rise homes. Much of the supply is off-plan with staged handovers.",
    connects: "The district is reached from Sheikh Zayed Road and Al Sufouh Road, with the tram and metro a short ride away at the Marina. Check road and transport links that are open now.",
    checks: ["The phase, handover date and what is built around your tower.", "Service charges and hotel-service charges in branded buildings.", "The view and what is planned in front of it.", "Registration and escrow account for off-plan."],
    faq: [
      { question: "Is Dubai Harbour freehold?", answer: "Yes, it is in a freehold area, so foreign nationals can buy and register property in their own name." },
      { question: "How is Dubai Harbour different from Dubai Marina?", answer: "Dubai Harbour is newer and still being completed, with more open water around it. Dubai Marina is an established, lived-in district." },
    ],
    related: ["buying-property-in-palm-jumeirah-dubai", "buying-property-in-dubai-marina", "buying-property-in-dubai-islands", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-dubai-islands",
    area: "Dubai Islands",
    name: "Dubai Islands",
    hook: "the new waterfront islands off Deira",
    summary:
      "Dubai Islands is a group of new man-made islands off the Deira coast, planned with beaches, marinas, hotels and residential districts. It suits buyers with a long horizon who like new waterfront living and accept that most of it is still being built and sold off-plan.",
    why: "The islands are planned as a new waterfront destination north of the old city, with beaches and a marina lifestyle. Because the development is young, the main questions are what is complete and when the rest will be.",
    whyPoints: ["New beaches and marinas.", "Planned hotels, retail and leisure.", "Waterfront apartments and villas.", "A short drive from Deira and the airport."],
    homes: "Apartments and some villas and townhouses, mostly off-plan, in new waterfront clusters. Resale is still very limited.",
    connects: "The islands are linked to the mainland by bridge and road, and the airport and old city are close. Check which links and public transport are open, and which are planned.",
    checks: ["What is built and what is on a masterplan only.", "Handover dates and the developer's earlier deliveries.", "Service charges and what they include.", "Registration and escrow account for off-plan."],
    faq: [
      { question: "Is Dubai Islands ready to live in?", answer: "Only parts of the master plan are built. Ask for the status of the specific phase and visit if you can." },
      { question: "Can foreigners buy on Dubai Islands?", answer: "Residential units sold to foreign buyers are in freehold areas; confirm the status of the specific project with the Dubai Land Department." },
    ],
    related: ["buying-property-in-dubai-harbour", "buying-property-in-dubai-creek-harbour", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-town-square-dubai",
    area: "Town Square",
    name: "Town Square",
    hook: "the family-focused community in Dubailand",
    summary:
      "Town Square is a large family-oriented community in Dubailand, with townhouses and apartments around parks, a retail core and a community feel. It suits buyers who want more space and a lower entry point than central Dubai, and who are happy to drive for most things.",
    why: "Town Square is built around central parks and community retail, with townhouse streets, schools and play areas rather than a skyline. It trades the waterfront for space and calm.",
    whyPoints: ["Parks, play areas and community retail.", "Townhouses and apartments.", "A quieter, family-oriented atmosphere.", "Lower entry points than central Dubai."],
    homes: "Townhouses and mid-rise apartments in phased clusters, with both ready and off-plan stock. Finishes and amenities vary by phase.",
    connects: "The community is reached from Emirates Road and the other Dubailand highways; most residents drive. Check the commute to your office and to schools.",
    checks: ["Which phase and how much construction is still going on.", "Distance to schools and the main roads.", "Service and community charges.", "The developer's earlier deliveries."],
    faq: [
      { question: "Is Town Square good for families?", answer: "It is designed for family living with parks and townhouses. Check the schools and clinics that are open now." },
      { question: "Is Town Square close to the metro?", answer: "No, most residents drive. Test the commute you will actually make." },
    ],
    related: ["buying-property-in-dubai-south", "buying-property-in-motor-city-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-mirdif-dubai",
    area: "Mirdif",
    name: "Mirdif",
    hook: "the established family suburb near the airport",
    summary:
      "Mirdif is one of Dubai's long-established family suburbs, close to the airport and Dubai Festival City, known for villas, schools, parks and its own large mall. It suits buyers who want a settled community and larger family homes, with the caveat that freehold ownership for foreigners applies only to certain projects.",
    why: "Mirdif is a place where families have lived for decades, with mature trees, schools, mosques, parks and a long-standing mall. It is a calm contrast to the towers of the centre and sits close to the airport.",
    whyPoints: ["A settled community with mature facilities.", "Villas and larger family homes.", "Close to the airport and Festival City.", "Several established schools."],
    homes: "Older villas and townhouses make up much of Mirdif, alongside newer apartment and townhouse projects. Resale dominates, and quality varies with age and maintenance.",
    connects: "Mirdif is reached from Sheikh Mohammed bin Zayed Road and Al Khawaneej Road, and the airport is close. Check the Dubai Metro and feeder links for your planned route.",
    checks: ["Whether the specific project is freehold for foreign buyers; much of Mirdif is not.", "Age, maintenance and any renovation needed on older villas.", "Community charges and utilities.", "Proximity to the airport flight path, if noise matters to you."],
    faq: [
      { question: "Can Indians buy property in Mirdif?", answer: "Only in projects designated as freehold; much of Mirdif is not. Confirm the status of the specific property with the Dubai Land Department." },
      { question: "Is Mirdif good for families?", answer: "It has long been a family neighbourhood, with schools, parks and larger homes. Check the school and traffic routes at peak hours." },
    ],
    related: ["buying-property-in-dubai-silicon-oasis", "buying-property-in-town-square-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-dubai-sports-city",
    area: "Dubai Sports City",
    name: "Dubai Sports City",
    hook: "the sports-venue community",
    summary:
      "Dubai Sports City is a freehold community built around sports venues, including a cricket stadium and golf, with mid-rise apartment buildings and some villas. It suits buyers who want an accessible entry price and a sporty, active community, and who accept that it is away from the central districts.",
    why: "The community was planned around sports facilities, with stadiums, academies and a golf course as its main identity. Apartments there are often chosen by buyers who value space and amenities above a central address.",
    whyPoints: ["Sports venues, academies and golf.", "Apartments and some villas.", "A more accessible entry point.", "A community identity built around sport."],
    homes: "Mid-rise apartment buildings dominate, with a smaller number of villas and townhouses. Most stock is ready and resale, with some new launches.",
    connects: "The community is reached from Emirates Road and Al Ain Road, and most residents drive. Check the commute to your office and the nearest metro.",
    checks: ["The building's age, service charges and maintenance.", "Parking allocation.", "Traffic on the approach roads at peak hours.", "Handover record for any new project."],
    faq: [
      { question: "Is Dubai Sports City freehold?", answer: "Yes, it is a freehold area, so foreign nationals can buy and register property." },
      { question: "Is Dubai Sports City far from central Dubai?", answer: "It is a drive from Downtown and the Marina, so check your commute at peak hours." },
    ],
    related: ["buying-property-in-motor-city-dubai", "buying-property-in-dubai-silicon-oasis", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-motor-city-dubai",
    area: "Motor City",
    name: "Motor City",
    hook: "the motorsport-themed community",
    summary:
      "Motor City is a freehold community built around the Dubai Autodrome and motorsport themes, with apartments, townhouses and villas in a lower-density, green layout. It suits buyers who want space, parks and an accessible price point, and who are happy to use a car for most trips.",
    why: "Motor City is known for its relaxed, low-rise feel with parks and open space, and for its motorsport identity. It sits close to Dubai Sports City and Dubailand.",
    whyPoints: ["The Dubai Autodrome and motorsport facilities.", "Low-rise apartments, townhouses and villas.", "Parks and green areas.", "A calmer layout than the towers of the centre."],
    homes: "Apartments in low- and mid-rise buildings, townhouses and some villas. Most stock is ready and resale, with a smaller number of new launches.",
    connects: "The community is reached from Sheikh Mohammed bin Zayed Road and Al Qudra and Emirates roads; most residents drive. Check the commute and any public transport you plan to use.",
    checks: ["The building's age, service charges and maintenance.", "Parking allocation for the unit.", "Noise from the autodrome if that matters to you.", "The developer's earlier deliveries for new launches."],
    faq: [
      { question: "Is Motor City freehold?", answer: "Yes, it is a freehold area open to foreign buyers." },
      { question: "Is Motor City noisy?", answer: "Parts close to the autodrome can be, on event days. Visit at different times." },
    ],
    related: ["buying-property-in-dubai-sports-city", "buying-property-in-jumeirah-village-triangle-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-jumeirah-village-triangle-dubai",
    area: "Jumeirah Village Triangle",
    name: "Jumeirah Village Triangle",
    metaName: "JVT",
    hook: "the quieter villa area by JVC",
    summary:
      "Jumeirah Village Triangle, known as JVT, is a planned community next to Jumeirah Village Circle, made up mainly of villas and townhouses on tree-lined streets with community parks. It suits buyers who want a quieter, low-rise family address at a moderate price point and who are happy to drive.",
    why: "JVT is calmer and lower-rise than its neighbour JVC, with houses rather than towers and a neighbourhood feel built around parks and small community retail. Many buyers pick it as a family-sized alternative close to Al Barsha and the Marina.",
    whyPoints: ["Villas and townhouses rather than towers.", "Parks and community retail.", "Close to JVC, Al Barsha and the Marina.", "A quieter, family-oriented layout."],
    homes: "Townhouses and villas in clusters, with a few low-rise apartment buildings. Resale is active, and new launches are rarer.",
    connects: "JVT is reached from Sheikh Mohammed bin Zayed Road and Al Khail Road, and the Marina and Al Barsha are a short drive. Most residents drive; check public transport options for your route.",
    checks: ["The condition and maintenance of older villas and townhouses.", "Community charges and what they include.", "Traffic at the entrances at peak hours.", "Plot size and layout for the specific home."],
    faq: [
      { question: "How is JVT different from JVC?", answer: "JVT is a smaller, lower-rise community of villas and townhouses, while JVC is larger and has many apartment buildings. Our JVC guide describes the contrast." },
      { question: "Is JVT freehold?", answer: "Yes, it is a freehold area, so foreign nationals can buy and register property." },
    ],
    related: ["buying-property-in-jvc-dubai", "buying-property-in-motor-city-dubai", ...CORE_DUBAI],
  }),
];
