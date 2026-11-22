/**
 * The Dubai areas the search covers: every area that Bayut and Property Finder list for Dubai on their own pages (read on 2026-11-22),
 * joined by name. An area appears on a portal's button row only if that portal lists it, so no button opens a page the portal does not have.
 * Only plain, well-known description is written here (no prices, yields, rankings or predictions). An area with no written description
 * still works for visitors but is not offered to search engines until it has one.
 * Villa and townhouse pages exist only where the portal showed at least 30 of them (counted on 2026-11-22).
 */
export interface Community {
  id: string;
  name: string;
  /** Short name buyers type. */
  short?: string;
  /** Plain description (two sentences at most). Missing means "not offered to search engines yet". */
  about?: string;
  bayutSlug?: string;
  propertyFinderSlug?: string;
  villas: boolean;
  townhouses: boolean;
  /** One of the twelve most-searched areas, shown first. */
  popular: boolean;
  /** Pages for individual bedroom counts are indexed only for the four most-searched communities. */
  indexBedroomPages: boolean;
}

export const COMMUNITIES_REVIEWED = "2026-11-22";

export const COMMUNITIES: readonly Community[] = [
  { id: "jumeirah-village-circle", name: "Jumeirah Village Circle", short: "JVC", about: "A large residential community in central Dubai, laid out in numbered districts around circular parks. It has many mid-rise apartment buildings, a mix of ready and off-plan projects, and a wide spread of prices.", bayutSlug: "jumeirah-village-circle-jvc", propertyFinderSlug: "jumeirah-village-circle", villas: false, townhouses: true, popular: true, indexBedroomPages: true },
  { id: "dubai-marina", name: "Dubai Marina", about: "A waterfront district built around an artificial canal, with high-rise towers, a promenade and a marina. It sits beside JBR and is served by the Dubai Metro and the Dubai Tram.", bayutSlug: "dubai-marina", propertyFinderSlug: "dubai-marina", villas: false, townhouses: false, popular: true, indexBedroomPages: true },
  { id: "downtown-dubai", name: "Downtown Dubai", about: "The central district around the Burj Khalifa and The Dubai Mall, mostly high-rise apartments and serviced residences. It is one of the most recognised addresses in the city.", bayutSlug: "downtown-dubai", propertyFinderSlug: "downtown-dubai", villas: false, townhouses: false, popular: true, indexBedroomPages: true },
  { id: "business-bay", name: "Business Bay", about: "A mixed commercial and residential district along the Dubai Canal, next to Downtown Dubai. Most homes are apartments in towers, from studios to larger layouts.", bayutSlug: "business-bay", propertyFinderSlug: "business-bay", villas: false, townhouses: false, popular: true, indexBedroomPages: true },
  { id: "palm-jumeirah", name: "Palm Jumeirah", about: "A man-made, palm-shaped island off the Dubai coast. It has apartment buildings along the trunk and individual villas on the fronds.", bayutSlug: "palm-jumeirah", propertyFinderSlug: "palm-jumeirah", villas: true, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "jumeirah-lake-towers", name: "Jumeirah Lake Towers", short: "JLT", about: "A cluster of towers arranged around artificial lakes, beside Dubai Marina. It mixes residential and office buildings.", bayutSlug: "jumeirah-lake-towers-jlt", propertyFinderSlug: "jumeirah-lake-towers", villas: false, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "dubai-hills-estate", name: "Dubai Hills Estate", about: "A master-planned community with a golf course, developed by Emaar and Meraas. It has apartments, townhouses and villas.", bayutSlug: "dubai-hills-estate", propertyFinderSlug: "dubai-hills-estate", villas: true, townhouses: true, popular: true, indexBedroomPages: false },
  { id: "arjan", name: "Arjan", about: "An apartment-focused residential community in inland Dubai, with mid-rise buildings and a mix of ready and off-plan projects.", bayutSlug: "arjan", propertyFinderSlug: "arjan", villas: false, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "dubai-sports-city", name: "Dubai Sports City", about: "A sports-themed community in Dubailand with stadiums and training facilities, and mid-rise apartment buildings around them.", bayutSlug: "dubai-sports-city", propertyFinderSlug: "dubai-sports-city", villas: false, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "al-furjan", name: "Al Furjan", about: "A residential community in the south-west of Dubai with apartments and townhouses, and a Dubai Metro station.", bayutSlug: "al-furjan", propertyFinderSlug: "al-furjan", villas: true, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "dubai-south", name: "Dubai South", about: "A large master-planned area around Al Maktoum International Airport (Dubai World Central), close to Expo City Dubai.", bayutSlug: "dubai-south", propertyFinderSlug: "dubai-south-dubai-world-central", villas: true, townhouses: true, popular: true, indexBedroomPages: false },
  { id: "jumeirah-beach-residence", name: "Jumeirah Beach Residence", short: "JBR", about: "A beachfront community of residential towers along The Walk, next to Dubai Marina.", bayutSlug: "jumeirah-beach-residence-jbr", propertyFinderSlug: "jumeirah-beach-residence", villas: false, townhouses: false, popular: true, indexBedroomPages: false },
  { id: "dubai-creek-harbour", name: "Dubai Creek Harbour", about: "A large waterfront development beside the creek and the Ras Al Khor Wildlife Sanctuary, developed by Emaar.", bayutSlug: "dubai-creek-harbour", propertyFinderSlug: "dubai-creek-harbour-the-lagoons", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-harbour", name: "Dubai Harbour", about: "A waterfront development on the coast near Palm Jumeirah and Bluewaters, with a marina and a cruise terminal.", bayutSlug: "dubai-harbour", propertyFinderSlug: "dubai-harbour", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "bluewaters-island", name: "Bluewaters Island", about: "A man-made island opposite JBR with residential buildings, shops and restaurants.", bayutSlug: "bluewaters-island", propertyFinderSlug: "bluewaters", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-islands", name: "Dubai Islands", about: "A group of man-made islands off the Deira coast, being developed in phases.", bayutSlug: "dubai-islands", propertyFinderSlug: "dubai-islands", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "palm-jebel-ali", name: "Palm Jebel Ali", about: "A large palm-shaped island project off the Jebel Ali coast, planned in phases.", bayutSlug: "palm-jebel-ali", propertyFinderSlug: "palm-jebel-ali", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-world-islands", name: "The World Islands", about: "A group of man-made islands arranged in the shape of a world map, off the Dubai coast.", bayutSlug: "the-world-islands", propertyFinderSlug: "the-world-islands", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-jaddaf", name: "Al Jaddaf", about: "A district along Dubai Creek with residential towers and a Dubai Metro station.", bayutSlug: "al-jaddaf", propertyFinderSlug: "al-jaddaf", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-maritime-city", name: "Dubai Maritime City", about: "A waterfront area near Port Rashid, planned around the maritime industry.", bayutSlug: "dubai-maritime-city", propertyFinderSlug: "maritime-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "mina-rashid", name: "Mina Rashid", about: "The area around Port Rashid, redeveloped with a marina and residential towers.", bayutSlug: "mina-rashid", propertyFinderSlug: "mina-rashid", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "meydan", name: "Meydan", about: "An area built around Meydan Racecourse, with apartments, villas and several master-planned communities.", bayutSlug: "meydan-city", propertyFinderSlug: "meydan", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sobha-hartland", name: "Sobha Hartland", about: "A master-planned community in the Meydan area by Sobha Realty, with apartments and villas.", bayutSlug: "sobha-hartland", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "mohammed-bin-rashid-city", name: "Mohammed Bin Rashid City", short: "MBR City", about: "A very large master-planned district in central Dubai that holds several communities, including District One and Sobha Hartland.", bayutSlug: "mohammed-bin-rashid-city", propertyFinderSlug: "mohammed-bin-rashid-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "town-square", name: "Town Square", about: "A family-oriented community by Nshama in Dubailand, with townhouses and apartments.", bayutSlug: "town-square", propertyFinderSlug: "town-square", villas: false, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "damac-hills", name: "DAMAC Hills", about: "A golf-course community by DAMAC in Dubailand with apartments, townhouses and villas.", bayutSlug: "damac-hills", propertyFinderSlug: "damac-hills", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "damac-hills-2", name: "DAMAC Hills 2", about: "A large DAMAC community in Dubailand, also called Akoya, made up mostly of townhouses and villas.", bayutSlug: "damac-hills-2-akoya-by-damac", propertyFinderSlug: "damac-hills-2", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "damac-lagoons", name: "DAMAC Lagoons", about: "A DAMAC community with lagoons and Mediterranean-style townhouses and villas, in Dubailand.", bayutSlug: "damac-lagoons", propertyFinderSlug: "damac-lagoons", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "arabian-ranches", name: "Arabian Ranches", about: "A well-established villa and townhouse community by Emaar, in the Dubailand area.", bayutSlug: "arabian-ranches", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "the-springs", name: "The Springs", about: "An established community of townhouses and villas by Emaar, set around lakes.", bayutSlug: "the-springs", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "jumeirah-golf-estates", name: "Jumeirah Golf Estates", about: "A golf community with villas and apartments around championship courses.", bayutSlug: "jumeirah-golf-estates", propertyFinderSlug: "jumeirah-golf-estates", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "jumeirah-islands", name: "Jumeirah Islands", about: "A gated community of villas on small man-made islands within a lake.", bayutSlug: "jumeirah-islands", propertyFinderSlug: "jumeirah-islands", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-barari", name: "Al Barari", about: "A low-density community of villas and apartments set in landscaped gardens.", bayutSlug: "al-barari", propertyFinderSlug: "al-barari", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "mudon", name: "Mudon", about: "A community of townhouses and villas by Dubai Properties in Dubailand.", bayutSlug: "mudon", propertyFinderSlug: "mudon", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "motor-city", name: "Motor City", about: "A residential community built around the Dubai Autodrome, with apartments, townhouses and villas.", bayutSlug: "motor-city", propertyFinderSlug: "motor-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "discovery-gardens", name: "Discovery Gardens", about: "A community of mid-rise apartment buildings around landscaped gardens, near Jebel Ali.", bayutSlug: "discovery-gardens", propertyFinderSlug: "discovery-gardens", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "international-city", name: "International City", about: "A large residential area in Al Warsan, made up of themed clusters of low-rise apartment buildings.", bayutSlug: "international-city", propertyFinderSlug: "international-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-silicon-oasis", name: "Dubai Silicon Oasis", short: "DSO", about: "A free-zone technology park and residential community with apartments, townhouses and villas.", bayutSlug: "dubai-silicon-oasis-dso", propertyFinderSlug: "dubai-silicon-oasis", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-investment-park", name: "Dubai Investments Park", short: "DIP", about: "A mixed industrial and residential area in the south-west of Dubai, with apartments and villas.", bayutSlug: "dubai-investment-park-dip", propertyFinderSlug: "dubai-investment-park-dip", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "dubai-festival-city", name: "Dubai Festival City", about: "A mixed-use community on Dubai Creek with homes, a mall and a marina.", bayutSlug: "dubai-festival-city", propertyFinderSlug: "dubai-festival-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "mirdif", name: "Mirdif", about: "An established family residential area in east Dubai, with villas and apartments.", bayutSlug: "mirdif", propertyFinderSlug: "mirdif", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "deira", name: "Deira", about: "One of Dubai's oldest districts, on the north side of Dubai Creek.", bayutSlug: "deira", propertyFinderSlug: "deira", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "bur-dubai", name: "Bur Dubai", about: "One of Dubai's oldest districts, on the west side of Dubai Creek.", propertyFinderSlug: "bur-dubai", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-barsha", name: "Al Barsha", about: "A residential area in west Dubai with apartments and villas, close to Mall of the Emirates.", bayutSlug: "al-barsha", propertyFinderSlug: "al-barsha", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "barsha-heights", name: "Barsha Heights (Tecom)", about: "A district of towers near Dubai Internet City and Dubai Media City, served by the Dubai Metro.", bayutSlug: "tecom", propertyFinderSlug: "barsha-heights-tecom", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-greens", name: "The Greens", about: "A residential community of mid-rise apartment buildings around landscaped courtyards.", bayutSlug: "the-greens", propertyFinderSlug: "greens", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-views", name: "The Views", about: "A community of apartments around lakes and a golf course.", bayutSlug: "the-views", propertyFinderSlug: "the-views", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "difc", name: "DIFC", about: "Dubai International Financial Centre, a financial free zone with office towers and some residences.", bayutSlug: "difc", propertyFinderSlug: "difc", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "jumeirah", name: "Jumeirah", about: "A long-established coastal district of villas and low-rise buildings along the Dubai coast.", bayutSlug: "jumeirah", propertyFinderSlug: "jumeirah", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "umm-suqeim", name: "Umm Suqeim", about: "A coastal residential area next to Jumeirah, known for villas and close to the Burj Al Arab.", bayutSlug: "umm-suqeim", propertyFinderSlug: "umm-suqeim", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-wasl", name: "Al Wasl", about: "A central residential district beside Jumeirah, with villas and newer apartment buildings.", bayutSlug: "al-wasl", propertyFinderSlug: "al-wasl", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-satwa", name: "Al Satwa", about: "A central, mixed residential and commercial district near Sheikh Zayed Road.", bayutSlug: "al-satwa", propertyFinderSlug: "al-satwa", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-quoz", name: "Al Quoz", about: "A mixed industrial, arts and residential district inland from Al Wasl.", propertyFinderSlug: "al-quoz", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-design-district", name: "Dubai Design District", short: "D3", about: "A creative district next to Business Bay with studios, offices and apartments.", bayutSlug: "dubai-design-district", propertyFinderSlug: "dubai-design-district", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "expo-city", name: "Expo City", about: "The former Expo site in Dubai South, now being developed as Expo City Dubai with homes and offices.", bayutSlug: "expo-city", propertyFinderSlug: "expo-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "world-trade-centre", name: "Dubai World Trade Centre", short: "DWTC", about: "The area around Dubai World Trade Centre on Sheikh Zayed Road.", bayutSlug: "world-trade-centre", propertyFinderSlug: "world-trade-center", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-waterfront", name: "Dubai Waterfront", about: "A large waterfront development near Jebel Ali, planned in phases.", bayutSlug: "dubai-waterfront", propertyFinderSlug: "dubai-waterfront", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "jebel-ali", name: "Jebel Ali", about: "A large area in south-west Dubai that includes the port and free zone and several residential communities.", bayutSlug: "jebel-ali", propertyFinderSlug: "jebel-ali", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "green-community", name: "Green Community", about: "A community of villas and townhouses in the Dubai Investments Park area.", bayutSlug: "green-community", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubailand", name: "Dubailand", about: "A very large area of south-east Dubai that holds many communities, such as Arabian Ranches and Dubai Sports City.", bayutSlug: "dubailand", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-media-city", name: "Dubai Media City", about: "A business district for media and technology companies, with residential towers nearby.", bayutSlug: "dubai-media-city", propertyFinderSlug: "dubai-media-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-internet-city", name: "Dubai Internet City", about: "A business district for technology companies, with residential towers nearby.", bayutSlug: "dubai-internet-city", propertyFinderSlug: "dubai-internet-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-production-city", name: "Dubai Production City", short: "IMPZ", about: "A media and printing free zone in Dubailand with residential towers.", bayutSlug: "dubai-production-city-impz", propertyFinderSlug: "dubai-production-city-impz", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-land-residence-complex", name: "Dubai Land Residence Complex", short: "DLRC", bayutSlug: "dubai-land-residence-complex", propertyFinderSlug: "dubai-land-residence-complex", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "majan", name: "Majan", bayutSlug: "majan", propertyFinderSlug: "majan", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "jumeirah-village-triangle", name: "Jumeirah Village Triangle", short: "JVT", bayutSlug: "jumeirah-village-triangle-jvt", propertyFinderSlug: "jumeirah-village-triangle", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "dubai-science-park", name: "Dubai Science Park", bayutSlug: "dubai-science-park", propertyFinderSlug: "dubai-science-park", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-studio-city", name: "Dubai Studio City", bayutSlug: "dubai-studio-city", propertyFinderSlug: "dubai-studio-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sobha-hartland-2", name: "Sobha Hartland 2", bayutSlug: "sobha-hartland-2", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-industrial-city", name: "Dubai Industrial City", bayutSlug: "dubai-industrial-city", propertyFinderSlug: "dubai-industrial-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "wasl-gate", name: "Wasl Gate", bayutSlug: "wasl-gate", propertyFinderSlug: "wasl-gate", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "liwan", name: "Liwan", bayutSlug: "liwan", propertyFinderSlug: "liwan", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "liwan-2", name: "Liwan 2", bayutSlug: "liwan-2", propertyFinderSlug: "liwan-2", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "meydan-horizon", name: "Meydan Horizon", bayutSlug: "meydan-horizon", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "za-abeel", name: "Za'abeel", bayutSlug: "za-abeel", propertyFinderSlug: "zabeel", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "culture-village", name: "Culture Village", bayutSlug: "culture-village", propertyFinderSlug: "culture-village", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "city-of-arabia", name: "City of Arabia", bayutSlug: "city-of-arabia", propertyFinderSlug: "city-of-arabia", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "remraam", name: "Remraam", bayutSlug: "remraam", propertyFinderSlug: "remraam", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sobha-central", name: "Sobha Central", bayutSlug: "sobha-central", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-sufouh", name: "Al Sufouh", bayutSlug: "al-sufouh", propertyFinderSlug: "al-sufouh", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sheikh-zayed-road", name: "Sheikh Zayed Road", bayutSlug: "sheikh-zayed-road", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "living-legends", name: "Living Legends", bayutSlug: "living-legends", propertyFinderSlug: "living-legends", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "falcon-city-of-wonders", name: "Falcon City of Wonders", bayutSlug: "falcon-city-of-wonders", propertyFinderSlug: "falcon-city-of-wonders", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "jumeirah-heights", name: "Jumeirah Heights", bayutSlug: "jumeirah-heights", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "athlon-by-aldar", name: "Athlon by Aldar", bayutSlug: "athlon-by-aldar", propertyFinderSlug: "athlon-by-aldar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sobha-sanctuary", name: "Sobha Sanctuary", bayutSlug: "sobha-sanctuary", propertyFinderSlug: "sobha-sanctuary", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-wilds", name: "The Wilds", bayutSlug: "the-wilds", propertyFinderSlug: "the-wilds-by-aldar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-lifestyle-city", name: "Dubai Lifestyle City", bayutSlug: "dubai-lifestyle-city", propertyFinderSlug: "dubai-lifestyle-city", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "california-village", name: "California Village", bayutSlug: "california-village", propertyFinderSlug: "california-village", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-hills", name: "The Hills", bayutSlug: "the-hills", propertyFinderSlug: "the-hills", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "nad-al-hamar", name: "Nad Al Hamar", bayutSlug: "nad-al-hamar", propertyFinderSlug: "nadd-al-hammar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "difc-zabeel-district", name: "DIFC Zabeel District", bayutSlug: "difc-zabeel-district", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-mina", name: "Al Mina", bayutSlug: "al-mina", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "ras-al-khor", name: "Ras Al Khor", bayutSlug: "ras-al-khor", propertyFinderSlug: "ras-al-khor", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-valley-by-emaar", name: "The Valley by Emaar", bayutSlug: "the-valley-by-emaar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "hadaeq-sheikh-mohammed-bin-rashid", name: "Hadaeq Sheikh Mohammed Bin Rashid", bayutSlug: "hadaeq-sheikh-mohammed-bin-rashid", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "tilal-binghatti", name: "Tilal Binghatti", bayutSlug: "tilal-binghatti", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "nad-al-sheba", name: "Nad Al Sheba", bayutSlug: "nad-al-sheba", propertyFinderSlug: "nad-al-sheba", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-acres", name: "The Acres", bayutSlug: "the-acres", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-qusais", name: "Al Qusais", bayutSlug: "al-qusais", propertyFinderSlug: "al-qusais", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "the-oasis-by-emaar", name: "The Oasis by Emaar", bayutSlug: "the-oasis-by-emaar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "sobha-elwood", name: "Sobha Elwood", bayutSlug: "sobha-elwood", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "damac-islands-2", name: "DAMAC Islands 2", bayutSlug: "damac-islands-2", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "dubai-peninsula", name: "Dubai Peninsula", bayutSlug: "dubai-peninsula", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "pearl-jumeirah", name: "Pearl Jumeirah", bayutSlug: "pearl-jumeirah", villas: true, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "reem", name: "Reem", bayutSlug: "reem", villas: true, townhouses: true, popular: false, indexBedroomPages: false },
  { id: "bukadra", name: "Bukadra", propertyFinderSlug: "bukadra", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "ghaf-woods", name: "Ghaf Woods", propertyFinderSlug: "ghaf-woods", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "downtown-jebel-ali", name: "Downtown Jebel Ali", propertyFinderSlug: "downtown-jebel-ali", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "haven-by-aldar", name: "Haven by Aldar", propertyFinderSlug: "haven-by-aldar", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-safa", name: "Al Safa", propertyFinderSlug: "al-safa", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "rukan", name: "Rukan", propertyFinderSlug: "rukan", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-muhaisnah", name: "Al Muhaisnah", propertyFinderSlug: "al-muhaisnah", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "al-waha-villas", name: "Al Waha Villas", propertyFinderSlug: "al-waha-villas", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "reportage-hills", name: "Reportage Hills", propertyFinderSlug: "reportage-hills", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
  { id: "bianca", name: "Bianca", propertyFinderSlug: "bianca", villas: false, townhouses: false, popular: false, indexBedroomPages: false },
];

export function getCommunity(id: string): Community | undefined {
  return COMMUNITIES.find((c) => c.id === id);
}

export function communityLabel(c: Community): string {
  return c.short ? `${c.name} (${c.short})` : c.name;
}

/** Areas with a written description: the only ones whose pages are offered to search engines. */
export function isDescribed(c: Community): boolean {
  return !!c.about;
}
