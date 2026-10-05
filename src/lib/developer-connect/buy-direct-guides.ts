/**
 * "Buy property directly from the developer" guides — the content behind
 * /buy-direct-from-developer and /buy-direct-from-developer/[market].
 *
 * Each market maps onto an APPROVED location page (location-pages.ts), so a
 * guide never exists for a place the directory has no real listing for, and
 * every guide carries market-specific facts (the regulator a buyer checks a
 * project against) plus the live list of that market's verified developers —
 * substance a templated "doorway" page would not have.
 *
 * Regulator facts are deliberately limited to WHO regulates and WHERE to
 * check — no fees, percentages or legal advice that could go stale or be
 * wrong. Pure data + pure functions, no framework imports.
 */
import { resolveLocationPage, type LocationPage } from "./location-pages.ts";

export const BUY_DIRECT_PATH = "/buy-direct-from-developer";

export interface Regulator {
  name: string;
  /** Official website; omitted when the regulator is per-state or per-emirate rather than one body. */
  url?: string;
  /** One factual sentence on what a buyer checks there. */
  check: string;
}

export interface BuyDirectMarket {
  slug: string;
  /** Display name used in headings ("Mumbai", "the UAE"). */
  name: string;
  /** Name used in titles ("Mumbai", "UAE"). */
  titleName: string;
  location: LocationPage;
  regulator: Regulator;
  /** Market-specific, factual tips shown in addition to the shared steps. */
  tips: string[];
  /** Slugs of related guides, for internal linking. */
  related: string[];
}

const MAHARERA: Regulator = {
  name: "MahaRERA (Maharashtra Real Estate Regulatory Authority)",
  url: "https://maharera.maharashtra.gov.in",
  check:
    "Every new project in Maharashtra must be registered with MahaRERA. Search the project's MahaRERA registration number on the MahaRERA website and confirm the promoter named there is the developer whose website you are on.",
};

const INDIA_RERA_TIP =
  "Under India's Real Estate (Regulation and Development) Act, 2016, each state has its own RERA authority. Registered projects display their RERA registration number on advertisements and on the developer's website.";

const UAE_ESCROW_TIP =
  "For off-plan property, pay only into the project's escrow account named in your sale agreement — never into a personal account or one you were sent by message.";

interface MarketDefinition {
  slug: string;
  country: string;
  city?: string;
  name: string;
  titleName: string;
  regulator: Regulator;
  tips: string[];
  related: string[];
}

const MARKETS: readonly MarketDefinition[] = [
  {
    slug: "india",
    country: "India",
    name: "India",
    titleName: "India",
    regulator: {
      name: "Your state's RERA authority",
      check:
        "Each Indian state runs its own RERA authority and website. Find the project's RERA registration number and check it on the RERA portal of the state the project is in.",
    },
    tips: [INDIA_RERA_TIP],
    related: ["mumbai", "bangalore", "hyderabad", "pune", "gurugram"],
  },
  {
    slug: "mumbai",
    country: "India",
    city: "Mumbai",
    name: "Mumbai",
    titleName: "Mumbai",
    regulator: MAHARERA,
    tips: [INDIA_RERA_TIP],
    related: ["navi-mumbai", "thane", "pune", "india"],
  },
  {
    slug: "navi-mumbai",
    country: "India",
    city: "Navi Mumbai",
    name: "Navi Mumbai",
    titleName: "Navi Mumbai",
    regulator: MAHARERA,
    tips: [INDIA_RERA_TIP],
    related: ["mumbai", "thane", "pune", "india"],
  },
  {
    slug: "thane",
    country: "India",
    city: "Thane",
    name: "Thane",
    titleName: "Thane",
    regulator: MAHARERA,
    tips: [INDIA_RERA_TIP],
    related: ["mumbai", "navi-mumbai", "pune", "india"],
  },
  {
    slug: "pune",
    country: "India",
    city: "Pune",
    name: "Pune",
    titleName: "Pune",
    regulator: MAHARERA,
    tips: [INDIA_RERA_TIP],
    related: ["mumbai", "navi-mumbai", "thane", "india"],
  },
  {
    slug: "bangalore",
    country: "India",
    city: "Bangalore",
    name: "Bangalore",
    titleName: "Bangalore",
    regulator: {
      name: "K-RERA (Karnataka Real Estate Regulatory Authority)",
      url: "https://rera.karnataka.gov.in",
      check:
        "Projects in Bangalore must be registered with Karnataka RERA. Search the project's registration on the K-RERA website and confirm the promoter matches the developer.",
    },
    tips: [INDIA_RERA_TIP],
    related: ["hyderabad", "pune", "mumbai", "india"],
  },
  {
    slug: "hyderabad",
    country: "India",
    city: "Hyderabad",
    name: "Hyderabad",
    titleName: "Hyderabad",
    regulator: {
      name: "Telangana RERA",
      url: "https://rera.telangana.gov.in",
      check:
        "Projects in Hyderabad must be registered with Telangana RERA. Check the project's registration on the Telangana RERA website and confirm the promoter matches the developer.",
    },
    tips: [INDIA_RERA_TIP],
    related: ["bangalore", "pune", "mumbai", "india"],
  },
  {
    slug: "gurugram",
    country: "India",
    city: "Gurugram",
    name: "Gurugram",
    titleName: "Gurugram",
    regulator: {
      name: "HRERA (Haryana Real Estate Regulatory Authority), Gurugram",
      url: "https://haryanarera.gov.in",
      check:
        "Projects in Gurugram are registered with Haryana RERA's Gurugram authority. Check the project's registration on the Haryana RERA website and confirm the promoter matches the developer.",
    },
    tips: [INDIA_RERA_TIP],
    related: ["mumbai", "bangalore", "hyderabad", "india"],
  },
  {
    slug: "uae",
    country: "United Arab Emirates",
    name: "the UAE",
    titleName: "UAE",
    regulator: {
      name: "Each emirate's land and real estate authority",
      check:
        "Property in the UAE is regulated emirate by emirate — for example the Dubai Land Department in Dubai and the Abu Dhabi Real Estate Centre in Abu Dhabi. Check the project and developer with the authority of the emirate the property is in.",
    },
    tips: [UAE_ESCROW_TIP],
    related: ["dubai", "abu-dhabi"],
  },
  {
    slug: "dubai",
    country: "United Arab Emirates",
    city: "Dubai",
    name: "Dubai",
    titleName: "Dubai",
    regulator: {
      name: "Dubai Land Department (DLD) and its Real Estate Regulatory Agency (RERA)",
      url: "https://dubailand.gov.ae",
      check:
        "Developers and off-plan projects in Dubai are registered with the Dubai Land Department. Check the project and developer through the DLD's official channels, such as the Dubai REST app, before paying anything.",
    },
    tips: [UAE_ESCROW_TIP],
    related: ["abu-dhabi", "uae"],
  },
  {
    slug: "abu-dhabi",
    country: "United Arab Emirates",
    city: "Abu Dhabi",
    name: "Abu Dhabi",
    titleName: "Abu Dhabi",
    regulator: {
      name: "Abu Dhabi Real Estate Centre (ADREC)",
      url: "https://adrec.gov.ae/en",
      check:
        "Real estate in Abu Dhabi is regulated by the Abu Dhabi Real Estate Centre. Check the developer and project with ADREC's official channels before paying anything.",
    },
    tips: [UAE_ESCROW_TIP],
    related: ["dubai", "uae"],
  },
];

/** Every guide market, in display order. Markets whose location isn't approved are dropped, never faked. */
export function buyDirectMarkets(): BuyDirectMarket[] {
  return MARKETS.flatMap((market) => {
    const location = resolveLocationPage(market.country, market.city);
    if (!location) return [];
    return [
      {
        slug: market.slug,
        name: market.name,
        titleName: market.titleName,
        location,
        regulator: market.regulator,
        tips: market.tips,
        related: market.related,
      },
    ];
  });
}

export function getBuyDirectMarket(slug: string): BuyDirectMarket | null {
  return buyDirectMarkets().find((market) => market.slug === slug.toLowerCase()) ?? null;
}

/** The guide for a developer's own city (or, failing that, its country) — used for internal links from developer pages. */
export function buyDirectMarketForLocation(country: string, city: string): BuyDirectMarket | null {
  const markets = buyDirectMarkets();
  const location = resolveLocationPage(country, city);
  if (location?.city) {
    const cityMarket = markets.find((market) => market.location.city === location.city);
    if (cityMarket) return cityMarket;
  }
  return markets.find((market) => !market.location.city && market.location.country.toLowerCase() === country.toLowerCase()) ?? null;
}

export function buyDirectPath(market?: Pick<BuyDirectMarket, "slug"> | null): string {
  return market ? `${BUY_DIRECT_PATH}/${market.slug}` : BUY_DIRECT_PATH;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** The shared, step-by-step "how to buy directly" process. */
export const BUY_DIRECT_STEPS: { title: string; body: string }[] = [
  {
    title: "Find the developer's genuine official website",
    body: "Fake and look-alike websites are common. Use a developer's verified official website — every developer on Developer Connects links to the site we have verified as theirs — rather than a search ad or a link someone sent you.",
  },
  {
    title: "Check the project with the regulator",
    body: "Confirm the project is registered with the real estate regulator for its location, and that the developer named in the registration is the one you are dealing with.",
  },
  {
    title: "Contact the developer through its official channels",
    body: "Use the phone numbers, email addresses and sales offices published on the official website. A developer's own sales team can share pricing, payment plans, floor plans and availability directly.",
  },
  {
    title: "Get every term in writing",
    body: "Ask for the price, payment schedule, possession or handover date and all charges in writing, and read the sale agreement in full before you sign. Consider independent legal advice.",
  },
  {
    title: "Pay only into the project's official account",
    body: "Make payments only into the bank account named in your signed agreement for that project. Never pay into a personal account, and be wary of urgent requests to pay.",
  },
];

/** Shared FAQ for the hub and every market guide; the market name is woven in where it is genuinely relevant. */
export function buyDirectFaq(market?: BuyDirectMarket | null): FaqItem[] {
  const where = market ? ` in ${market.name}` : "";
  return [
    {
      question: `Can I buy property directly from a developer${where}?`,
      answer: `Yes. Developers${where} sell new and off-plan homes through their own sales teams, and you can contact them through their official website without going through a broker.`,
    },
    {
      question: "Is it cheaper to buy directly from the developer?",
      answer:
        "Not always. Developers usually set the same list price whichever way you come in, but buying directly can avoid a separate brokerage fee, and you get pricing, offers and payment plans from the source. Compare the final, all-in cost in writing.",
    },
    {
      question: "How do I know I am on the developer's real website?",
      answer:
        "Look the developer up on Developer Connects: each listing shows the official website we have verified as belonging to that developer, with the date it was last verified. Be cautious of look-alike domains and of websites reached through ads or messages.",
    },
    {
      question: `How do I check a project is genuine${where}?`,
      answer: market
        ? `${market.regulator.check}`
        : "Check the project with the real estate regulator for the place where the property is — in India, the state's RERA authority; in the UAE, the land and real estate authority of the emirate.",
    },
    {
      question: "Does Developer Connects sell property or take a commission?",
      answer:
        "No. Developer Connects is an independent directory. We don't sell property, take commissions or pass your details to anyone — we help you reach the developer's own official website.",
    },
  ];
}
