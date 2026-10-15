import type { FaqEntry } from "./types.ts";

/**
 * The "property consultant in {city}" pages: what Developer Connects does for a buyer in that city, which areas it covers, the
 * regulator to check, and the questions buyers ask. Each is its own page (not a templated list), with city-specific areas, regulator
 * and questions. Nothing here claims a ranking, a review score or a guarantee.
 */

export interface AreaGroup {
  heading: string;
  areas: readonly string[];
}

export interface ConsultantPage {
  slug: string;
  name: string;
  market: "mumbai" | "dubai";
  /** The page's h1. */
  title: string;
  metaTitle: string;
  description: string;
  intro: string;
  helpWith: readonly string[];
  areaGroups: readonly AreaGroup[];
  regulator: { name: string; check: string };
  /** The directory view this page links to (must be an approved location page). */
  directory: { country: string; city: string };
  /** Guide slugs most useful to this city's buyer. */
  guides: readonly string[];
  /** False for a landing page that search engines and links reach but that is not a card in the consultant hub. */
  inHub?: boolean;
  /** A related page this one links to in its body (for example the harbour side of Mumbai). */
  alsoServing?: { label: string; slug: string };
  faq: readonly FaqEntry[];
}

export const CONSULTANT_PAGES: readonly ConsultantPage[] = [
  {
    slug: "mumbai",
    name: "Mumbai",
    market: "mumbai",
    title: "Property consultant in Mumbai",
    metaTitle: "Property Consultant in Mumbai | Developer Connects",
    description:
      "Property advice for buyers in Mumbai, led by Ambish Singh: project comparison, MahaRERA checks, site visits, loans and paperwork, from the first short list to possession.",
    intro:
      "Developer Connects helps buyers in Mumbai research the project before they commit. You get a short list that fits your budget and area, with prices, payment plans and possession dates side by side, the MahaRERA checks explained, and someone alongside you on the site visit.",
    helpWith: [
      "Turning a budget and a commute into a short list of Mumbai micro-markets and projects.",
      "Comparing new launches and ready homes on one cost sheet, including GST, stamp duty and registration.",
      "Checking each project's MahaRERA registration, declared completion date and disclosures.",
      "Planning site visits around your day, with the questions to ask at each project.",
      "Helping you through the agreement, the loan and possession, with every cost explained first.",
    ],
    areaGroups: [
      { heading: "Island city and the western suburbs", areas: ["South Mumbai", "Worli", "Lower Parel", "Bandra", "Juhu", "Andheri", "Goregaon", "Malad", "Kandivali", "Borivali", "Dahisar"] },
      { heading: "Central and harbour suburbs", areas: ["Powai", "Ghatkopar", "Chembur", "Mulund", "Wadala", "Kurla", "Vikhroli"] },
      { heading: "Beyond the suburbs", areas: ["Mira Road", "Bhayandar", "Vasai", "Virar"] },
    ],
    regulator: {
      name: "Maharashtra Real Estate Regulatory Authority (MahaRERA)",
      check: "Search the project on the MahaRERA website and match the registration number, promoter, location, completion date and bank account with what you were told.",
    },
    directory: { country: "India", city: "Mumbai" },
    alsoServing: { label: "Buying on the Navi Mumbai side? See our Navi Mumbai property advice", slug: "navi-mumbai" },
    guides: ["how-to-buy-a-flat-in-mumbai", "hidden-costs-of-buying-property-in-mumbai", "check-a-project-on-maharera", "buying-property-in-goregaon-east", "buying-property-in-powai", "buying-property-in-andheri", "mumbai-vs-navi-mumbai-vs-thane"],
    faq: [
      { question: "Who is Developer Connects?", answer: "Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by founder Ambish Singh, who has more than six years of real estate strategy and investment experience." },
      { question: "Which parts of Mumbai do you cover?", answer: "The island city and the western, central and harbour suburbs, plus Mira-Bhayandar and Vasai-Virar. Thane and Navi Mumbai have their own pages." },
      { question: "How do I start?", answer: "Message or call Ambish, or tap your requirements in the one-minute enquiry form. You will get a short list based on your brief, and there is no obligation to book anything." },
    ],
  },
  {
    slug: "thane",
    name: "Thane",
    market: "mumbai",
    title: "Property consultant in Thane",
    metaTitle: "Property Consultant in Thane | Developer Connects",
    description:
      "Help buying a home in Thane: compare projects on Ghodbunder Road, Majiwada and Kolshet, check MahaRERA registrations and plan site visits in one day.",
    intro:
      "Thane has some of the widest choices in the Mumbai region, from established neighbourhoods to large new townships. Developer Connects helps you compare them on the same terms, check each project's registration, and visit with a plan.",
    helpWith: [
      "Choosing between Thane's neighbourhoods by commute, schools and the kind of project you want.",
      "Comparing new launches with ready homes on carpet-area price and total cost.",
      "Checking MahaRERA registrations, declared completion dates and the developer's earlier deliveries.",
      "Planning visits across several projects in one day.",
    ],
    areaGroups: [
      { heading: "Thane West", areas: ["Ghodbunder Road", "Majiwada", "Kolshet", "Hiranandani Estate", "Pokhran Road", "Naupada"] },
      { heading: "Thane East and beyond", areas: ["Kopri", "Balkum", "Kasarvadavali", "Waghbil"] },
    ],
    regulator: {
      name: "Maharashtra Real Estate Regulatory Authority (MahaRERA)",
      check: "Search the project on the MahaRERA website and match the registration number, promoter and completion date before paying any amount.",
    },
    directory: { country: "India", city: "Thane" },
    guides: ["buying-property-in-thane-west", "buying-property-in-majiwada-thane", "mumbai-vs-navi-mumbai-vs-thane", "how-to-buy-a-flat-in-mumbai", "under-construction-vs-ready-to-move", "site-visit-checklist"],
    faq: [
      { question: "Is Thane a good place to buy a home?", answer: "Thane is a mature city with its own schools, hospitals and markets and links to Mumbai by rail and road. Whether it suits you depends on your commute and budget, which is why we start there." },
      { question: "Can you show me projects across several developers?", answer: "Yes. The aim is to compare a handful of projects on one cost sheet, so you can see the differences clearly before you visit." },
    ],
  },
  {
    slug: "navi-mumbai",
    name: "Navi Mumbai",
    market: "mumbai",
    title: "Property consultant in Navi Mumbai",
    metaTitle: "Property Consultant in Navi Mumbai | Developer Connects",
    description:
      "Property advice for Navi Mumbai buyers: Kharghar, Ulwe, Panvel, Vashi and Nerul compared, MahaRERA checks, site-visit planning and costs explained.",
    intro:
      "Navi Mumbai's planned nodes and new infrastructure draw buyers who want space and a modern layout. Developer Connects helps you compare the nodes, understand which projects are close to completion, and check each one before you pay.",
    helpWith: [
      "Comparing nodes by commute, planned infrastructure and the kind of homes on offer.",
      "Separating projects that are close to completion from those still at an early stage.",
      "Checking MahaRERA registrations and the project bank account details.",
      "Costing every purchase, including GST, stamp duty, registration and deposits.",
    ],
    areaGroups: [
      { heading: "Established nodes", areas: ["Vashi", "Nerul", "Belapur", "Airoli", "Seawoods"] },
      { heading: "Growing nodes", areas: ["Kharghar", "Kamothe", "Ulwe", "Panvel", "Taloja"] },
    ],
    regulator: {
      name: "Maharashtra Real Estate Regulatory Authority (MahaRERA)",
      check: "Search the project on the MahaRERA website and match the registration number, promoter and completion date before paying any amount.",
    },
    directory: { country: "India", city: "Navi Mumbai" },
    inHub: false,
    guides: ["mumbai-vs-navi-mumbai-vs-thane", "under-construction-vs-ready-to-move", "check-a-project-on-maharera", "hidden-costs-of-buying-property-in-mumbai"],
    faq: [
      { question: "Which part of Navi Mumbai should I buy in?", answer: "It depends on where you work and your budget. Established nodes like Vashi and Nerul have mature facilities; growing nodes like Kharghar and Ulwe offer newer projects. We compare them against your commute." },
      { question: "Is infrastructure in Navi Mumbai ready?", answer: "Parts are running and parts are planned. We recommend following the authorities' own announcements and not paying a premium for something that is not yet operating." },
    ],
  },
  {
    slug: "dubai",
    name: "Dubai",
    market: "dubai",
    title: "Property consultant in Dubai for Indian buyers",
    metaTitle: "Property Consultant in Dubai for Indian Buyers | Developer Connects",
    description:
      "Dubai property advice for buyers from India and the UAE, led by Ambish Singh: off-plan and ready, costs explained in rupees and dirhams, escrow and registration checks.",
    intro:
      "Buying in Dubai from India means a different regulator, different costs and different risks. Developer Connects helps you compare Dubai projects, explains every cost in dirhams and rupees, and shows you what to check on the Dubai Land Department's system before you pay a booking amount.",
    helpWith: [
      "Choosing between off-plan and ready property in Dubai, and between communities.",
      "Explaining the 4 percent Dubai Land Department fee, registration and service charges up front.",
      "Checking the developer, the project registration, the escrow account and the advertising permit.",
      "Planning the payment route from India and the questions to ask your bank and your accountant.",
      "Helping with the paperwork from reservation to handover, including a remote purchase if you cannot travel.",
    ],
    areaGroups: [
      { heading: "Established waterfront and city districts", areas: ["Downtown Dubai", "Dubai Marina", "Business Bay", "Palm Jumeirah", "Jumeirah Lakes Towers"] },
      { heading: "Master-planned communities", areas: ["Dubai Hills Estate", "Dubai Creek Harbour", "Jumeirah Village Circle", "Arjan", "Al Furjan", "Dubai South", "Dubai Silicon Oasis"] },
    ],
    regulator: {
      name: "Dubai Land Department and its Real Estate Regulatory Agency",
      check: "Confirm the project's registration, the developer's licence and the escrow account, and match the advertising permit number on the listing.",
    },
    directory: { country: "United Arab Emirates", city: "Dubai" },
    guides: ["buying-property-in-dubai-from-india", "dubai-off-plan-property-guide", "buying-property-in-dubai-marina", "buying-property-in-downtown-dubai", "buying-property-in-dubai-hills-estate", "buying-property-in-jvc-dubai", "dubai-golden-visa-property", "nri-buying-property-in-india"],
    faq: [
      { question: "Can Indians buy property in Dubai?", answer: "Yes. Foreign nationals, including Indians, can buy freehold property in designated areas of Dubai." },
      { question: "Can I buy a Dubai property without visiting?", answer: "A remote purchase is possible with careful document handling, but many buyers still visit once. We can plan a short, productive trip around a short list of projects." },
      { question: "How do I start?", answer: "Message or call Ambish on the UAE number, or tap your requirements in the one-minute enquiry form. You will get a short list, and there is no obligation to book." },
    ],
  },
];

export function getConsultantPage(slug: string): ConsultantPage | undefined {
  return CONSULTANT_PAGES.find((p) => p.slug === slug);
}

export const CONSULTANT_PATH = "/property-consultant";
export const consultantPath = (page: ConsultantPage): string => `${CONSULTANT_PATH}/${page.slug}`;
