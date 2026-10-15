import type { Block, FaqEntry, Guide } from "./types.ts";

/**
 * More neighbourhood guides, for the areas the city pages already list: Mumbai and the wider region (Navi Mumbai, Thane, Mira-Bhayandar,
 * Vasai-Virar) and Dubai. The same rules as guides-areas.ts apply: character, the kind of homes, how the area connects and what to check,
 * never a price, rent, yield or growth figure; infrastructure still being built is described as such with the reader told to check
 * its current status; no developer is named or ranked. Each guide has its own content: nothing here is a swapped-in place name.
 */

const UPDATED = "2026-10-15";

const MUMBAI_CHECKS: Block = {
  t: "note",
  title: "Check before you pay a token amount",
  text: "Open the project's page on the MahaRERA website yourself and match the registration number, promoter, completion date and bank account with what you were told. For resale, ask for the share certificate, the society's no-dues letter and the occupancy certificate.",
};

const DUBAI_CHECKS: Block = {
  t: "note",
  title: "Check before you pay a booking amount",
  text: "Confirm the project's registration and escrow account with the Dubai Land Department, match the advertising permit number on the listing, and ask for the building's current service charge per square foot in writing.",
};

interface AreaInput {
  slug: string;
  /** Exactly as it appears in a city page's "Areas we cover" list. */
  area: string;
  /** How the area reads in a sentence ("Mira Road" or "Dubai Creek Harbour"). */
  name: string;
  /** Short phrase for the meta description. */
  hook: string;
  summary: string;
  why: string;
  whyPoints: readonly string[];
  homes: string;
  connects: string;
  checks: readonly string[];
  faq: readonly [FaqEntry, FaqEntry];
  related: readonly string[];
}

function mumbaiArea(a: AreaInput): Guide {
  return {
    slug: a.slug,
    topic: "Mumbai neighbourhoods",
    area: a.area,
    title: `Buying property in ${a.name}: a guide for home buyers`,
    metaTitle: `Buying Property in ${a.name}: Area Guide for Home Buyers`,
    description: `Flats in ${a.name} explained: ${a.hook}, who the area suits, how it connects, and what to check with MahaRERA before you book.`,
    summary: a.summary,
    market: "mumbai",
    blocks: [
      { t: "h2", text: `Why buyers look at ${a.name}` },
      { t: "p", text: a.why },
      { t: "ul", items: a.whyPoints },
      { t: "h2", text: "The homes on offer" },
      { t: "p", text: a.homes },
      { t: "h2", text: `How ${a.name} connects` },
      { t: "p", text: a.connects },
      { t: "h2", text: `What to check in ${a.name}` },
      { t: "ul", items: a.checks },
      MUMBAI_CHECKS,
    ],
    faq: [
      a.faq[0],
      a.faq[1],
      {
        question: `Can Developer Connects help me buy in ${a.name}?`,
        answer: `Yes. Tell us your budget, the configuration you want and where you travel to every day. We will put a short list of ${a.name} projects side by side, with prices, payment plans and possession dates, explain the MahaRERA checks and plan the site visits with you.`,
      },
    ],
    related: a.related,
    updated: UPDATED,
  };
}

function dubaiArea(a: AreaInput): Guide {
  return {
    slug: a.slug,
    topic: "Dubai communities",
    area: a.area,
    title: `Buying property in ${a.name}: a guide for Indian buyers`,
    metaTitle: `Buying Property in ${a.name}: Guide for Indians`,
    description: `${a.name} for buyers from India: ${a.hook}, who the community suits, service charges, and the checks to make before you book.`,
    summary: a.summary,
    market: "dubai",
    blocks: [
      { t: "h2", text: `Why buyers look at ${a.name}` },
      { t: "p", text: a.why },
      { t: "ul", items: a.whyPoints },
      { t: "h2", text: "The homes on offer" },
      { t: "p", text: a.homes },
      { t: "h2", text: `How ${a.name} connects` },
      { t: "p", text: a.connects },
      { t: "h2", text: `What to check in ${a.name}` },
      { t: "ul", items: a.checks },
      DUBAI_CHECKS,
    ],
    faq: [
      a.faq[0],
      a.faq[1],
      {
        question: `Can Developer Connects help me buy in ${a.name} from India?`,
        answer: `Yes. We compare ${a.name} projects on one sheet with every cost in dirhams and rupees, explain the Dubai Land Department checks, and can plan a short visit or a remote purchase.`,
      },
    ],
    related: a.related,
    updated: UPDATED,
  };
}

const CORE_MUMBAI = ["how-to-buy-a-flat-in-mumbai", "hidden-costs-of-buying-property-in-mumbai"];
const CORE_DUBAI = ["buying-property-in-dubai-from-india", "dubai-golden-visa-property"];

const MUMBAI_AREAS: readonly Guide[] = [
  mumbaiArea({
    slug: "buying-property-in-bandra",
    area: "Bandra",
    name: "Bandra",
    hook: "the sea-facing suburb, its redevelopments",
    summary:
      "Bandra is one of Mumbai's most sought-after western suburbs, mixing old bungalows and villages with sea-facing towers, cafes and the business district at Bandra Kurla Complex across the railway line. It suits buyers who value an established, walkable address and accept that most stock is resale or redevelopment and that pricing is at the top end of the suburbs.",
    why: "Bandra has a character that new townships cannot copy: old Catholic villages, Pali Hill's lanes, the Carter Road and Bandstand promenades, and a dense run of restaurants, schools and hospitals. Bandra East, with Bandra Kurla Complex next door, is a separate market from Bandra West.",
    whyPoints: ["Walkable lanes, promenades and an established social life.", "Bandra Kurla Complex offices a short ride away.", "The Bandra-Worli Sea Link to south Mumbai.", "Strong demand from professionals and from families who already live there."],
    homes: "Very little land is left, so much of the supply is resale in older buildings and redevelopment projects replacing them. Flats tend to be compact for the price, with a smaller number of larger homes and sea-facing towers. New launches are few and are usually redevelopments.",
    connects: "Bandra is a junction on the Western line and has a Harbour line link. The Western Express Highway and the Sea Link carry road traffic, and the Santacruz-Chembur Link Road reaches the eastern suburbs. Metro lines in the area have been opening in phases, so check which stations are running before you plan your commute around one.",
    checks: ["For redevelopment, the society's resolution, the developer's agreement and your carpet area promised in the new building.", "Building age and structural audit for resale flats.", "Parking, which is scarce and is not included with every flat.", "Whether the flat is in the Bandra West or Bandra East catchment you actually want."],
    faq: [
      { question: "Is Bandra West or Bandra East better to buy in?", answer: "They are different markets. Bandra West is the older, lifestyle suburb near the sea; Bandra East is closer to Bandra Kurla Complex and the Western Express Highway. Choose by where you work and how you want to live." },
      { question: "Are new launches available in Bandra?", answer: "Very few. Most new supply comes from the redevelopment of old societies, where the promised carpet area and the developer's track record matter most." },
    ],
    related: ["buying-property-in-worli", "buying-property-in-andheri", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-worli",
    area: "Worli",
    name: "Worli",
    hook: "the sea-face towers and redevelopment projects",
    summary:
      "Worli is a central south Mumbai district between Lower Parel and the Bandra-Worli Sea Link, known for sea-facing towers, old BDD chawl redevelopment and offices at the edge of the old mill lands. It suits buyers who want a central address with a skyline and sea views and who are comfortable with premium, mostly tower-based living.",
    why: "Worli sits where south Mumbai's offices, the sea link to the suburbs and the old mill lands meet. A few minutes' drive reaches Lower Parel's offices and retail, Bandra by the Sea Link and the island city's business districts.",
    whyPoints: ["Sea and skyline views from the taller towers.", "Close to Lower Parel and Prabhadevi offices.", "The Sea Link to Bandra and the western suburbs.", "A mix of old neighbourhoods and new high-rise towers."],
    homes: "Newer towers dominate, from compact apartments to large flats and penthouses, alongside older buildings and BDD chawl redevelopment projects. Resale and new launches both exist. Amenities in the taller towers can be extensive, which is also reflected in the maintenance charges.",
    connects: "Worli is served by the Western line at nearby Lower Parel and Mahalaxmi, and by the Sea Link. The underground Metro Line 3 serves the district, and the coastal road to the north has been opening in stages; check the current status of both rather than paying a premium for a promised connection.",
    checks: ["The exact floor, facing and what is planned in front of the view you are paying for.", "Maintenance and amenity charges, which can be high in tall towers.", "For redevelopment, the rehabilitation arrangement and the developer's earlier deliveries.", "The commute you actually make at peak hour."],
    faq: [
      { question: "Is Worli good for working professionals?", answer: "It is well placed for people working in Lower Parel, Prabhadevi, Nariman Point or Bandra Kurla Complex, because road, rail and metro connections are close. Peak-hour road congestion is the main drawback." },
      { question: "Are most Worli homes new or resale?", answer: "Both. Many sea-facing towers are recent, and a large amount of supply is from redevelopment. Always confirm the occupancy certificate and the registration of any project still being completed." },
    ],
    related: ["buying-property-in-bandra", "buying-property-in-chembur", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-malad",
    area: "Malad",
    name: "Malad",
    hook: "Link Road towers, malls and offices",
    summary:
      "Malad is a large western suburb with Malad West along the Link Road, malls and offices, and Malad East beside the Western Express Highway. It suits buyers who want a well-served, mid-market suburb with a good choice of towers and a strong rental pool, and who can plan around the traffic on the Link Road and the highway.",
    why: "Malad has become a self-contained suburb: shopping malls, offices around Mindspace, schools, hospitals and a long run of residential towers. Malad West and Malad East feel like different places, so decide which side suits your commute.",
    whyPoints: ["Malls, offices and the Mindspace business park close by.", "A wide range of towers and sizes.", "The Link Road and the Western Express Highway both nearby.", "A large pool of renters from the offices around."],
    homes: "Malad has everything from older societies to new high-rise projects with clubs and gardens. Two- and three-bedroom apartments are the bulk of the market, with a good flow of both resale and new launches. Some towers sit on reclaimed or lower-lying land, so drainage in the monsoon is worth checking.",
    connects: "Malad is on the Western line, and the Link Road and the Western Express Highway carry the road traffic. Metro lines along the highway and the Link Road have been opening in phases; confirm which stations are in service before you rely on them.",
    checks: ["Monsoon waterlogging on the road and in the building's compound.", "How far the building is from the Link Road or the highway, and the traffic at peak hours.", "Carpet area in the agreement, not the loading on the brochure.", "For new projects, the MahaRERA completion date and the promoter's earlier deliveries."],
    faq: [
      { question: "Is Malad West or Malad East better for families?", answer: "Malad West is closer to the Link Road, malls and offices; Malad East is nearer the Western Express Highway and often offers a different range of towers. Visit both at peak hours before you choose." },
      { question: "Does Malad flood in the monsoon?", answer: "Some pockets have had waterlogging in heavy rain. Ask residents, visit after a heavy shower if you can and check the building's own drainage before you book." },
    ],
    related: ["buying-property-in-kandivali", "buying-property-in-goregaon-east", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-kandivali",
    area: "Kandivali",
    name: "Kandivali",
    hook: "Thakur Village, Charkop and the highway belt",
    summary:
      "Kandivali is a northern western suburb of planned townships such as Thakur Village and Mahavir Nagar, with newer projects towards Charkop and along the Western Express Highway. It suits buyers who want more space and a township feel than the central suburbs offer, accepting a longer ride to south Mumbai.",
    why: "Kandivali is known for its large townships, wider internal roads and a steady flow of new launches. Kandivali East, along the highway, and Kandivali West, towards Charkop and Mahavir Nagar, offer different environments.",
    whyPoints: ["Planned townships with clubs and internal roads.", "A wide choice of new launches and resale.", "Schools, hospitals and markets nearby.", "More space for the budget than the central suburbs."],
    homes: "Mid-sized apartments in large towers are typical, with compact flats nearer the station and larger towers inside the townships. New projects often come with a clubhouse and open areas. Pockets of older, low-rise buildings remain around the station.",
    connects: "Kandivali is on the Western line, and the Western Express Highway and the Link Road take road traffic; peak-hour congestion on both is part of daily life. Metro lines along the highway have been opening in phases, so verify which stations are working.",
    checks: ["The distance from the station and the quality of the last mile of road.", "Township charges and maintenance, which vary widely.", "The completion date and registration of any new project on MahaRERA.", "Your realistic peak-hour commute to your office."],
    faq: [
      { question: "Is Kandivali a good place to buy for a first home?", answer: "Many buyers choose it for more space at a lower entry cost than the central suburbs. The trade-off is a longer journey to south Mumbai and peak-hour road traffic." },
      { question: "Are there new launches in Kandivali?", answer: "Yes, Kandivali has a steady flow of launches, especially along the highway and towards Charkop. Check each project's MahaRERA registration and completion date." },
    ],
    related: ["buying-property-in-borivali", "buying-property-in-malad", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-borivali",
    area: "Borivali",
    name: "Borivali",
    hook: "the national-park edge and rail hub",
    summary:
      "Borivali is the northern edge of Mumbai's western suburbs, beside Sanjay Gandhi National Park, with a major railway station and a long run of established and new residential towers. It suits buyers who want green surroundings and strong rail connectivity, and who can accept a long commute to south Mumbai.",
    why: "Borivali's draw is the national park next door and the fact that many fast trains start or end here, which makes a seat on the way to town more likely. It is a mature suburb with markets, schools and hospitals already in place.",
    whyPoints: ["Sanjay Gandhi National Park beside it.", "A major station with many fast trains.", "Established schools, hospitals and markets.", "A wide choice of resale and new homes."],
    homes: "Borivali West has older, established societies and many redevelopments; Borivali East has newer towers near the national park and along the highway. Two- and three-bedroom flats are the core, with larger homes in the newer towers.",
    connects: "The Western line, with fast and slow trains, is the backbone, and the Western Express Highway carries road traffic. Metro lines in the area have been opening in phases, and tunnel and link-road projects have been planned; check which are actually running.",
    checks: ["The distance to the station and to the highway, and the road in between.", "Redevelopment status and the society's papers for older buildings.", "The building's maintenance and open-space promises for new towers.", "MahaRERA registration for new projects."],
    faq: [
      { question: "Is Borivali good for senior citizens?", answer: "Many buyers choose it for the greenery, markets and hospitals close at hand, and a station with plenty of trains. Check that the building has a lift and step-free access." },
      { question: "How far is Borivali from south Mumbai?", answer: "It is the far end of the western suburbs, so the journey to south Mumbai is long at peak hours by train or road. Many residents work in the western suburbs instead." },
    ],
    related: ["buying-property-in-kandivali", "buying-property-in-mira-road", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-chembur",
    area: "Chembur",
    name: "Chembur",
    hook: "an established eastern suburb",
    summary:
      "Chembur is an established eastern suburb known for its Sindhi and Punjabi colonies, schools and the Eastern Freeway to south Mumbai. It suits buyers who want a long-settled neighbourhood with a good road link to the island city and the Bandra Kurla Complex, with a mix of older societies and new towers.",
    why: "Chembur has stayed a neighbourhood where families live for generations. It has good schools and hospitals, an old market culture and, more recently, tall new towers on former industrial land.",
    whyPoints: ["Long-settled neighbourhoods with strong social ties.", "The Eastern Freeway to south Mumbai.", "The Santacruz-Chembur Link Road to Bandra Kurla Complex.", "Established schools and hospitals."],
    homes: "Older, low-rise societies sit beside newer high-rise projects, many of them on former industrial plots. Redevelopment is common. Both resale and new launches are available, in sizes from compact to large.",
    connects: "Chembur is on the Harbour line, with a link to the Central line at Kurla, and has a monorail station. The Eastern Freeway and the link road carry road traffic. A metro line in the area has been under construction for some time, so check the current status.",
    checks: ["The history of the plot and clearances for projects on former industrial land.", "Air and noise levels near industrial and port areas.", "The society's papers for redevelopment projects.", "The distance from the monorail or Harbour line station."],
    faq: [
      { question: "Is Chembur a good place to buy near Bandra Kurla Complex?", answer: "Chembur offers a settled neighbourhood with a road link to Bandra Kurla Complex, which is attractive to professionals working there. Check your own peak-hour journey before you decide." },
      { question: "Does Chembur have air-quality concerns?", answer: "Pockets near industrial and port areas can be affected. Visit at different times of day and ask residents before you buy in those pockets." },
    ],
    related: ["buying-property-in-ghatkopar", "buying-property-in-worli", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-mulund",
    area: "Mulund",
    name: "Mulund",
    hook: "the greener eastern edge towards Thane",
    summary:
      "Mulund is a calm eastern suburb on the border with Thane, known for open spaces, a well-organised civic feel and offices along the Eastern Express Highway. It suits buyers who want a quieter, greener neighbourhood on the Central line with easy access to Thane and the highway.",
    why: "Mulund is often described as one of Mumbai's more orderly suburbs, with wide roads, gardens and a settled community. It is close to Thane and Airoli and has a mix of offices, schools and hospitals within a short drive.",
    whyPoints: ["A calmer, greener suburb.", "Close to Thane and the Airoli bridge to Navi Mumbai.", "Offices and business parks along the highway.", "An established residential community."],
    homes: "Mulund West has older societies and premium towers, while Mulund East and the Nahur belt have newer projects. Two- and three-bedroom flats are common, and new launches appear regularly along the highway.",
    connects: "Mulund is on the Central line, and the Eastern Express Highway runs past it towards Thane and the south. The Airoli bridge links it to Navi Mumbai. Several link-road and tunnel projects have been planned or are under construction; check their status.",
    checks: ["Peak-hour traffic on the Eastern Express Highway.", "Whether the project is in Mulund West or the Nahur belt, which differ in character.", "Distance to the station and to the highway.", "MahaRERA registration for new launches."],
    faq: [
      { question: "Is Mulund a good choice for families?", answer: "Many families choose it for the open space, schools and a quieter pace compared with the central suburbs. The trade-off is a longer commute to south Mumbai." },
      { question: "How does Mulund compare with Thane?", answer: "Mulund is inside Mumbai and on the Central line, while Thane offers a larger choice of new projects. Our Mumbai, Navi Mumbai and Thane comparison guide sets them side by side." },
    ],
    related: ["buying-property-in-ghatkopar", "mumbai-vs-navi-mumbai-vs-thane", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-ghatkopar",
    area: "Ghatkopar",
    name: "Ghatkopar",
    hook: "the rail and metro junction on the eastern side",
    summary:
      "Ghatkopar is a busy eastern suburb at the meeting point of the Central line, the metro to Andheri and the Eastern Express Highway, with a dense mix of old societies, markets and new towers. It suits buyers who rank connectivity first and accept crowded roads and a lively commercial core.",
    why: "Ghatkopar's strength is that three modes meet here: the Central line, the Versova-Ghatkopar metro and the highway. That makes it a practical base for people working in Andheri East, Bandra Kurla Complex or the eastern suburbs.",
    whyPoints: ["The metro to Andheri and the Western line.", "The Central line and the Eastern Express Highway.", "A large retail and market belt.", "Strong demand from renters working in Andheri East."],
    homes: "Older societies in Ghatkopar East and West sit alongside redevelopment projects and some new high-rise towers. Compact one- and two-bedroom flats are common, with larger homes in newer towers.",
    connects: "The Central line, the Mumbai Metro's first line to Andheri and Versova, and the Eastern Express Highway are all here. The Santacruz-Chembur Link Road is nearby. Further metro lines are planned or under construction; confirm status before relying on them.",
    checks: ["Noise and congestion near the station and the highway.", "Redevelopment papers and the society's resolution for older buildings.", "Distance to the metro station on foot.", "Building age and structural audit for resale flats."],
    faq: [
      { question: "Is Ghatkopar good for renting out?", answer: "Demand from people working in Andheri East, Bandra Kurla Complex and the eastern suburbs is steady because of the metro and rail links. Check your own numbers against current listings before relying on rent." },
      { question: "Is Ghatkopar East or West better?", answer: "Ghatkopar West is closer to the station, the metro and the retail belt, and East is quieter with different pricing. Visit both at peak hours." },
    ],
    related: ["buying-property-in-chembur", "buying-property-in-mulund", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-mira-road",
    area: "Mira Road",
    name: "Mira Road",
    hook: "Mira-Bhayandar's value belt on the Western line",
    summary:
      "Mira Road is a large suburb in Mira-Bhayandar, on the Western line beyond Dahisar, offering more space for a lower entry cost than the inner suburbs. It suits first-time buyers and families who can accept a long commute and who want a new, amenity-rich project.",
    why: "Mira Road grew as an affordable alternative to Borivali and Dahisar. It has a steady flow of new launches with clubhouses and gardens, plus schools, markets and hospitals that have built up over the last two decades.",
    whyPoints: ["Larger flats for the budget than the inner suburbs.", "A wide range of new, amenity-rich projects.", "The Western line and the highway.", "Growing social infrastructure."],
    homes: "Mid-sized apartments in large towers are typical, with many one- and two-bedroom flats. Most supply is in new and recent projects, with some older low-rise buildings near the station. Resale is active.",
    connects: "Mira Road is on the Western line, and the Western Express Highway carries road traffic to the suburbs and the island city. Metro lines through Mira-Bhayandar have been planned and are under construction; check their status rather than paying for a promise.",
    checks: ["The commute to your office at peak hours, tried once on a weekday.", "The distance from the station and the quality of the last mile of road.", "MahaRERA registration, completion date and promoter's earlier deliveries.", "Water supply and maintenance arrangements."],
    faq: [
      { question: "Is Mira Road a safe area to buy in?", answer: "Pockets differ. Visit at different times of day, speak to residents and check the building's own security and the surrounding neighbourhood before you book." },
      { question: "What is the difference between Mira Road and Bhayandar?", answer: "Both are in Mira-Bhayandar. Mira Road is the larger, newer belt of towers, while Bhayandar is older and nearer the creek and the highway." },
    ],
    related: ["buying-property-in-vasai", "buying-property-in-borivali", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-vasai",
    area: "Vasai",
    name: "Vasai",
    hook: "Vasai-Virar's affordable, fast-growing belt",
    summary:
      "Vasai and Virar are the northern end of Mumbai's metropolitan region on the Western line, known for lower entry prices, new townships and a long commute to the city. It suits buyers prioritising space and budget over proximity, and who work along the Western line or have flexible work.",
    why: "Vasai-Virar is where much of the region's new, larger-format housing is built, with townships, schools and markets growing alongside. The old Vasai fort area, the coast and the greenery give it a character of its own.",
    whyPoints: ["Lower entry cost than the inner suburbs.", "Large townships with amenities.", "Coastal and green surroundings.", "A mix of old Vasai town and new development."],
    homes: "One- and two-bedroom apartments in large townships are the core of the market, with some larger flats and a limited number of villas and row houses. Most supply is new or recent.",
    connects: "The Western line, with fast and slow trains, and the Western Express Highway connect Vasai-Virar to the city. A creek bridge and rail upgrades have been planned or built in stages; the commute to south Mumbai remains long.",
    checks: ["The commute to your workplace, which is the deciding factor.", "Whether the project is in a flood-prone or low-lying area.", "Water supply, which has been a concern in some belts.", "MahaRERA registration and the promoter's earlier deliveries."],
    faq: [
      { question: "Is Vasai-Virar a good investment?", answer: "It offers lower entry costs and a lot of new supply, but the value you see depends on the project, the connectivity and your own use. We never promise returns; compare it with other options for your situation." },
      { question: "Is Vasai part of Mumbai?", answer: "Vasai-Virar lies in the Mumbai Metropolitan Region but is governed by its own municipal corporation and sits outside Mumbai city limits." },
    ],
    related: ["buying-property-in-mira-road", "buying-property-in-borivali", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-kharghar",
    area: "Kharghar",
    name: "Kharghar",
    hook: "Navi Mumbai's planned node near the airport",
    summary:
      "Kharghar is a planned node of Navi Mumbai on the Harbour line, with wide roads, parks and a hill backdrop, and it is close to the new airport at Ulwe. It suits buyers who want a planned, green neighbourhood with space and who are comfortable with the longer ride to Mumbai.",
    why: "Kharghar was laid out by CIDCO with sectors, open spaces and a central park, which makes it more orderly than most suburbs of Mumbai. It sits between Navi Mumbai's older nodes and Panvel, and it is close to the airport corridor.",
    whyPoints: ["A planned sector layout and wide roads.", "Parks, golf and hill views nearby.", "Close to the Navi Mumbai airport corridor.", "A mix of ready and new homes."],
    homes: "Mid-sized apartments in gated societies are the norm, with a growing number of larger homes and some plotted developments around. New launches are frequent, and resale is active.",
    connects: "Kharghar is on the Harbour line and has a metro line that has been opening in Navi Mumbai; the Sion-Panvel highway and the Mumbai-Pune expressway are nearby. The airport and its road links have been opening in stages, so check their present status.",
    checks: ["The distance from the station and the sector's road quality.", "Whether the plot is CIDCO-allotted and the transfer papers are in order.", "The status of the airport and metro links you are counting on.", "MahaRERA registration for new launches."],
    faq: [
      { question: "Is Kharghar close to the Navi Mumbai airport?", answer: "It lies in the airport's catchment, but the route and the airport's operations have been rolling out in stages. Check the current status when you decide." },
      { question: "Is Kharghar better than Panvel?", answer: "Kharghar is more established, with a planned layout and social infrastructure. Panvel is larger, further out and growing quickly. The Navi Mumbai page compares the nodes." },
    ],
    related: ["buying-property-in-vashi", "buying-property-in-ulwe", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-vashi",
    area: "Vashi",
    name: "Vashi",
    hook: "Navi Mumbai's established commercial hub",
    summary:
      "Vashi is Navi Mumbai's oldest and most established commercial node, linked to Mumbai by the Vashi bridge and the Harbour line, with markets, offices and mature residential sectors. It suits buyers who want a settled neighbourhood with full social infrastructure and a shorter journey to Mumbai than the newer nodes.",
    why: "Vashi has been developed for decades, with a central market, offices, hospitals and schools, and it is the closest of the Navi Mumbai nodes to Mumbai. For many buyers it is the first stop on the Navi Mumbai side.",
    whyPoints: ["Mature infrastructure and a central market.", "The shortest link to Mumbai among the nodes.", "Offices and commercial buildings close by.", "A mix of old and redeveloped societies."],
    homes: "Older CIDCO-era buildings and societies dominate, with a growing number of redevelopment projects and a few new towers. Compact and mid-sized flats are common; new supply is limited because the node is built out.",
    connects: "Vashi has a major Harbour line station, a link to Mumbai across the Vashi creek bridges, and links onto the Sion-Panvel highway. Check the status of metro and other upgrades before relying on them.",
    checks: ["The age and structural condition of older buildings.", "Redevelopment papers for societies planning it.", "Parking and traffic around the station and market.", "Your commute to Mumbai at peak hours over the creek bridge."],
    faq: [
      { question: "Is Vashi a good alternative to Mumbai suburbs?", answer: "For many buyers it offers a settled neighbourhood and a reasonable link to Mumbai. Compare the journey time with your own workplace before choosing." },
      { question: "Are there new launches in Vashi?", answer: "Few, because the node is largely built out. Most supply is resale or redevelopment." },
    ],
    related: ["buying-property-in-kharghar", "mumbai-vs-navi-mumbai-vs-thane", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-ulwe",
    area: "Ulwe",
    name: "Ulwe",
    hook: "the airport-side node and its connectivity projects",
    summary:
      "Ulwe is a new node of Navi Mumbai beside the new airport and the Atal Setu sea link, with large new townships and a lot of infrastructure still being completed. It suits buyers who take a long view and accept that facilities and connections are still arriving, rather than those who want a finished neighbourhood now.",
    why: "Ulwe's story is infrastructure: the airport, the sea link and the rail and road upgrades around it. Much of that has been built in stages, so the area is still moving from planning to being lived in.",
    whyPoints: ["Close to the Navi Mumbai airport.", "Near the Atal Setu sea link to Mumbai.", "New townships with amenities.", "Lower entry costs than the established nodes."],
    homes: "Most homes are new apartments in large townships, from compact to mid-sized. Resale is still limited, and many projects are under construction, which makes completion dates and builder track record important.",
    connects: "Ulwe is on the Harbour line extension and close to the Sion-Panvel highway, the airport corridor and the sea link. These links have been opening in phases, so check each one's current status.",
    checks: ["Which connections are open and which are only planned.", "The completion date and registration of under-construction projects.", "Schools, hospitals and markets actually open in the neighbourhood.", "The promoter's earlier deliveries."],
    faq: [
      { question: "Is Ulwe a safe bet because of the airport?", answer: "The airport is a real driver, but we never promise price growth. Compare what you pay with what you get, and weigh how much of the connectivity is built today." },
      { question: "Is Ulwe ready to live in?", answer: "Parts of it are, and many projects are still being completed. Visit at different hours to see how lived-in the area is before you book." },
    ],
    related: ["buying-property-in-kharghar", "buying-property-in-vashi", ...CORE_MUMBAI],
  }),
  mumbaiArea({
    slug: "buying-property-in-majiwada-thane",
    area: "Majiwada",
    name: "Majiwada",
    hook: "the Thane West junction on the highway",
    summary:
      "Majiwada is a busy junction in Thane West on the Eastern Express Highway, close to the station, malls and hospitals, with towers rising on both sides of the highway. It suits buyers who want Thane's convenience, with a short run to Mumbai by road and a wide choice of new projects.",
    why: "Majiwada sits at a node where the highway meets Ghodbunder Road, and a short ride reaches the station. It has malls, hospitals and schools within a few minutes, which makes it practical for families.",
    whyPoints: ["Close to the highway and Ghodbunder Road.", "Malls, hospitals and schools within reach.", "A wide choice of new launches.", "Quick access to Mumbai's eastern suburbs."],
    homes: "Mid-sized apartments in towers are typical, with compact flats and larger homes in the newer projects. New launches are frequent, and the resale market is active.",
    connects: "Thane station on the Central line is nearby, and the Eastern Express Highway carries road traffic to Mumbai. Metro lines for Thane have been planned and are under construction; check which stations will open and when.",
    checks: ["Traffic at the junction at peak hours.", "Noise and air quality near the highway.", "Metro-related claims, which you should verify with the authority.", "MahaRERA registration for new projects."],
    faq: [
      { question: "Is Majiwada better than Ghodbunder Road?", answer: "Majiwada is closer to the station and the highway; Ghodbunder Road offers newer, larger townships further out. Our Thane guide compares them." },
      { question: "Is Majiwada noisy?", answer: "Parts near the highway are. Visit at peak hours and check which side the flat faces." },
    ],
    related: ["buying-property-in-thane-west", "buying-property-in-mulund", ...CORE_MUMBAI],
  }),
];

const DUBAI_AREAS: readonly Guide[] = [
  dubaiArea({
    slug: "buying-property-in-business-bay-dubai",
    area: "Business Bay",
    name: "Business Bay",
    hook: "canal-side towers beside Downtown",
    summary:
      "Business Bay is a canal-side district of residential and office towers beside Downtown Dubai, with views of the Burj Khalifa and the Dubai Canal. It suits buyers who want an urban address close to Downtown at an entry point below it, and who accept the construction and traffic of a district still filling in.",
    why: "Business Bay is effectively Downtown's neighbour, with the same road links and skyline but a different price point and a lot of new supply. The Dubai Canal gives it a waterfront, and many towers have views towards the Burj Khalifa.",
    whyPoints: ["A short drive to Downtown and the Dubai Mall.", "Canal-side promenades and restaurants.", "A big range of towers from compact to large.", "Both ready and off-plan options."],
    homes: "Almost all homes are apartments in towers, from studios to large units, with some serviced apartments. Both ready and off-plan stock is on offer, and some towers allow holiday-home letting.",
    connects: "Business Bay has a metro station on the Red Line, and Sheikh Zayed Road and Al Khail Road are close. Several canal-side crossings and road works have been progressing; check the current state of construction around your tower.",
    checks: ["Construction noise and the view in front of your flat.", "Service charges, which vary widely between towers.", "Whether the tower allows holiday-home letting.", "The developer's registration and escrow account for off-plan."],
    faq: [
      { question: "Is Business Bay a freehold area?", answer: "Yes, it is a freehold area, so foreign nationals, including Indians, can buy and register property in their own name." },
      { question: "How does Business Bay compare with Downtown Dubai?", answer: "It shares the road links and skyline with Downtown but has a different mix of towers and pricing. Our Downtown guide describes the contrast." },
    ],
    related: ["buying-property-in-downtown-dubai", "buying-property-in-jumeirah-lakes-towers-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-palm-jumeirah-dubai",
    area: "Palm Jumeirah",
    name: "Palm Jumeirah",
    hook: "villas, apartments and beach clubs",
    summary:
      "Palm Jumeirah is a man-made, palm-shaped island of villas, apartments and hotels along its fronds, trunk and crescent, with beach access and a strong lifestyle appeal. It suits buyers who want a resort-style address and who accept premium pricing and a single main route on and off the island.",
    why: "The Palm is a destination in itself: beaches, beach clubs, hotels and restaurants within the island, and views of the sea and the Dubai skyline. Choose carefully between the frond villas, the trunk apartments and the crescent hotels, because they are very different lives.",
    whyPoints: ["Beachfront living and sea views.", "Villas on the fronds, apartments on the trunk.", "Hotels and beach clubs on the crescent.", "Strong rental interest from visitors and residents."],
    homes: "Frond villas and townhouses, trunk apartment towers and branded residences within hotels give a wide choice. Resale dominates in the older parts, with new launches in newer residential towers and branded projects.",
    connects: "The island is reached from Sheikh Zayed Road by a single main approach, plus the Palm monorail and a link to the tram. Road traffic on the way in and out is part of daily life; ask residents about it.",
    checks: ["Whether the unit is in a villa, tower or branded residence.", "Beach and private-pool access for your specific unit.", "Service charges in towers and the cost of maintaining a villa.", "The building's rules on holiday-home letting."],
    faq: [
      { question: "Can Indians buy property on Palm Jumeirah?", answer: "Yes. Palm Jumeirah is a freehold area, so foreign nationals can buy and register property in their own name." },
      { question: "Is Palm Jumeirah a good place to rent out?", answer: "Demand is strong from visitors and residents, but returns vary by building and by season. We never promise yields; compare your own numbers against current listings." },
    ],
    related: ["buying-property-in-dubai-marina", "buying-property-in-dubai-creek-harbour", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-dubai-creek-harbour",
    area: "Dubai Creek Harbour",
    name: "Dubai Creek Harbour",
    hook: "the waterfront community on the creek",
    summary:
      "Dubai Creek Harbour is a large waterfront community beside Dubai Creek and the Ras Al Khor wildlife sanctuary, planned as a new centre with towers, parks and a marina. It suits buyers who want a modern, master-planned address with creek and skyline views and who understand that parts of it are still being built.",
    why: "The community was planned as a new downtown on the creek, with promenades, marinas and parks and a view of the Dubai skyline. Because it is still unfolding, phases differ greatly in what is complete.",
    whyPoints: ["Waterfront promenades and parks.", "A skyline view across the creek.", "Close to Downtown Dubai and the airport.", "A mix of ready and off-plan homes."],
    homes: "Apartments in towers are the core, with townhouses and some villas in phases. Many homes are off-plan, with handover dates that depend on the project, so the promoter's record matters.",
    connects: "The community is close to Ras Al Khor Road, Sheikh Zayed Road and the airport. A metro extension and a landmark tower have been planned or under construction; check their current state rather than relying on the brochure.",
    checks: ["Which phase is complete and which is still a construction site.", "The handover date and the developer's earlier deliveries.", "Service charges for the specific tower.", "Registration and escrow account with the Dubai Land Department."],
    faq: [
      { question: "Is Dubai Creek Harbour ready to live in?", answer: "Parts are, with more phases under way. Visit the area and ask for the status of the specific phase and the surrounding amenities." },
      { question: "Is Dubai Creek Harbour freehold?", answer: "Yes, it is a freehold area open to foreign buyers." },
    ],
    related: ["buying-property-in-business-bay-dubai", "buying-property-in-palm-jumeirah-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-arjan-dubai",
    area: "Arjan",
    name: "Arjan",
    hook: "the mid-market community near Al Barsha",
    summary:
      "Arjan is a mid-market residential community in the middle of Dubai's new districts, near Dubai Miracle Garden and the Sheikh Mohammed bin Zayed Road, with a large supply of apartments. It suits buyers who want a lower entry point in a central part of the city and who will compare the many buildings on service charges and finish.",
    why: "Arjan has grown quickly because it is more affordable than the waterfront districts yet reasonably central. It is a district of mid-rise apartment buildings, with new launches still arriving.",
    whyPoints: ["A lower entry point than waterfront districts.", "Central position near Al Barsha and Dubai Hills Estate.", "A wide choice of apartments and floor plans.", "Close to the highway network."],
    homes: "Apartments in mid-rise buildings, from studios to larger flats, dominate. There is both ready and off-plan stock. Finish quality and amenities vary between projects.",
    connects: "Arjan is close to Sheikh Mohammed bin Zayed Road and Al Khail Road, and the metro is a feeder-bus ride away rather than on foot. Check the daily route you will actually take.",
    checks: ["Distance from the metro and the quality of the last mile.", "Service charges and what they include.", "Finish quality and handover record of the developer.", "The number of units under construction around the building."],
    faq: [
      { question: "Is Arjan a good option for first-time Dubai buyers?", answer: "It offers a lower entry price in a central location. Compare buildings carefully on charges, finish and developer record." },
      { question: "Does Arjan have a metro?", answer: "There is no station inside the community, so most residents drive or use feeder transport. Check your own commute first." },
    ],
    related: ["buying-property-in-al-furjan-dubai", "buying-property-in-jvc-dubai", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-al-furjan-dubai",
    area: "Al Furjan",
    name: "Al Furjan",
    hook: "the family-friendly community with a metro link",
    summary:
      "Al Furjan is a master-planned community in south-west Dubai with townhouses, villas and apartments, a metro station and a quieter family feel. It suits buyers who want more space and a community atmosphere at a lower entry point than the central districts.",
    why: "Al Furjan's blend of townhouses and apartment buildings, parks and a metro stop has made it popular with families who want space without moving to the far suburbs. It is a short drive from Dubai Marina and Expo City.",
    whyPoints: ["Townhouses and villas as well as apartments.", "A metro station on the Red Line.", "Parks and community retail.", "Close to Dubai Marina and Expo City."],
    homes: "Townhouses and villas make up the character of the community, alongside apartment buildings near the metro. Both ready and off-plan stock exist.",
    connects: "Al Furjan has its own metro station and is close to Sheikh Zayed Road and Al Yalayis Road. Expo City and the Dubai Investment Park are close by.",
    checks: ["Whether the unit is in a townhouse cluster or a building.", "Service charges and community fees.", "The phase and construction around your home.", "The distance from your unit to the metro."],
    faq: [
      { question: "Is Al Furjan good for families?", answer: "It is designed for family living with parks and townhouses. Schools and shops grow with the community, so check what is open now." },
      { question: "How far is Al Furjan from Dubai Marina?", answer: "It is a short drive, which is part of its appeal for people working in the Marina and Jumeirah Lakes Towers." },
    ],
    related: ["buying-property-in-arjan-dubai", "buying-property-in-dubai-hills-estate", ...CORE_DUBAI],
  }),
  dubaiArea({
    slug: "buying-property-in-jumeirah-lakes-towers-dubai",
    area: "Jumeirah Lakes Towers",
    name: "Jumeirah Lakes Towers",
    hook: "lake-side towers close to the Marina",
    summary:
      "Jumeirah Lakes Towers, known as JLT, is a district of tower clusters around artificial lakes next to Dubai Marina, with offices, apartments and a metro and tram link. It suits buyers who want a lively, central address close to the Marina at a more accessible price point and who like a mix of residential and business life.",
    why: "JLT's attraction is the combination of a lake-side setting, a business district and the Marina next door. It has cafes and shops at the base of most towers and offices in the same clusters.",
    whyPoints: ["Lake-side clusters of towers.", "Next to Dubai Marina and the beach.", "Offices and apartments in one district.", "Metro and tram access."],
    homes: "Apartments in towers, from studios to larger units, with offices in the same district. Most stock is ready and resale. Buildings differ in age, view and service charges.",
    connects: "JLT has metro stations on the Red Line and a link to the Dubai Tram. Sheikh Zayed Road is next door, and the Marina and the beach are a short ride.",
    checks: ["The cluster and the tower's age, view and service charges.", "Parking allocation for the unit.", "Noise near the road, offices and construction.", "Whether the building allows holiday-home letting."],
    faq: [
      { question: "Is Jumeirah Lakes Towers freehold?", answer: "Yes, it is a freehold area, so foreign nationals, including Indians, can buy and register property." },
      { question: "How is JLT different from Dubai Marina?", answer: "JLT is more of an office-and-residence district around lakes, while the Marina is a waterfront promenade. They are next to each other, and JLT is often more accessible." },
    ],
    related: ["buying-property-in-dubai-marina", "buying-property-in-business-bay-dubai", ...CORE_DUBAI],
  }),
];

export const MORE_AREA_GUIDES: readonly Guide[] = [...MUMBAI_AREAS, ...DUBAI_AREAS];
