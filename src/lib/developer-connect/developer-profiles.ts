/**
 * Short, sourced "About" facts for selected developers, shown on their public profile.
 *
 * Rules (enforced by developer-profiles.test.ts):
 *  - Only facts the public sources AGREE on. A fact sources dispute (a founding year, a headquarters, a revenue figure) is left
 *    out rather than guessed.
 *  - Plain, neutral wording: no praise, no ranking, no "verified"/"best"/"guarantee" language, no price or return claims.
 *  - Sources appear on the page as plain names only (the site never links out to third parties). The full URLs live here so the
 *    Founder can audit every line.
 *  - `checked` is the month the facts were last compared with the sources; refresh it whenever a profile is edited.
 */

export interface DeveloperProfileFact {
  label: string;
  value: string;
}

export interface DeveloperProfileSource {
  name: string;
  url: string;
}

export interface DeveloperProfile {
  /** Matches developers.slug. */
  slug: string;
  summary: string;
  facts: readonly DeveloperProfileFact[];
  sources: readonly DeveloperProfileSource[];
  checked: string;
}

export const DEVELOPER_PROFILES: readonly DeveloperProfile[] = [
  {
    slug: "lodha",
    summary: "Lodha is a Mumbai real estate developer. It is listed on the NSE as Lodha Developers Limited, formerly Macrotech Developers.",
    facts: [
      { label: "Based in", value: "Mumbai" },
      { label: "Listed", value: "NSE, symbol LODHA, since April 2021 (then as Macrotech Developers)" },
      { label: "Known projects", value: "Lodha Altamount, Lodha Park, Lodha World Towers, and the Palava township near Dombivli" },
      { label: "Active in", value: "Mumbai, Thane, Pune, Bengaluru and Hyderabad" },
    ],
    sources: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Lodha_Group" },
      { name: "Simply Wall St company profile", url: "https://simplywall.st/stocks/in/real-estate-management-and-development/nse-lodha/macrotech-developers-shares/information" },
    ],
    checked: "October 2026",
  },
  {
    slug: "godrej-properties",
    summary: "Godrej Properties is the real estate arm of the Godrej Group, based in Vikhroli, Mumbai.",
    facts: [
      { label: "Based in", value: "Vikhroli East, Mumbai" },
      { label: "Listed", value: "NSE (GODREJPROP) and BSE (533150); public since 2010" },
      { label: "Known projects", value: "Godrej BKC in Bandra Kurla Complex, Godrej Brooklyn Avenue and Godrej Eternia" },
      { label: "Main markets", value: "Mumbai region, Delhi NCR, Pune and Bengaluru" },
    ],
    sources: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Godrej_Properties" },
      { name: "BSE corporate filing", url: "https://bseindia.com/xml-data/corpfiling/AttachHis/21382e9f-6d00-472b-971e-3fa136a3ed5a.pdf" },
    ],
    checked: "October 2026",
  },
  {
    slug: "rustomjee",
    summary: "Rustomjee is the brand of Keystone Realtors Limited, a Mumbai developer that builds across the Mumbai Metropolitan Region.",
    facts: [
      { label: "Company", value: "Keystone Realtors Limited" },
      { label: "Based in", value: "Andheri East, Mumbai" },
      { label: "Incorporated", value: "1995 in Mumbai; listed on the stock exchanges in November 2022" },
      { label: "Known projects", value: "Rustomjee Elements in Juhu, Rustomjee Crown in Prabhadevi, Rustomjee Paramount in Khar and Rustomjee Urbania in Thane" },
    ],
    sources: [
      { name: "Kotak Securities company page", url: "https://www.kotaksecurities.com/stocks/keystone-realtors-ltd/" },
      { name: "Business Standard listing report", url: "https://www.business-standard.com/amp/article/markets/keystone-realtors-makes-quiet-debut-but-analysts-see-long-term-value-122112400258_1.html" },
    ],
    checked: "October 2026",
  },
  {
    slug: "binghatti-developers",
    summary: "Binghatti is a Dubai developer that began as a construction contractor in 2008 and moved into residential development.",
    facts: [
      { label: "Based in", value: "Dubai" },
      { label: "Began", value: "2008, founded by Hussain Binghatti" },
      { label: "Known projects", value: "Binghatti Amber and Binghatti House" },
      { label: "Areas", value: "Business Bay, Jumeirah Village Circle, Dubai Silicon Oasis and Al Jaddaf" },
    ],
    sources: [
      { name: "Edarabia company listing", url: "https://www.edarabia.com/binghatti-holding-dubai-uae/" },
      { name: "World Economic Forum organisation page", url: "https://jp.weforum.org/organizations/binghatti-holding-limited/" },
    ],
    checked: "October 2026",
  },
  {
    slug: "sobha-realty",
    summary: "Sobha Realty is a Dubai developer. Its parent group began in 1976 in Oman as an interior decoration business founded by P. N. C. Menon.",
    facts: [
      { label: "Based in", value: "Dubai, United Arab Emirates" },
      { label: "Group origin", value: "1976, Oman" },
      { label: "Known community", value: "Sobha Hartland, in Mohammed Bin Rashid City" },
      { label: "Note", value: "Sobha Realty in Dubai is a separate company from Sobha Limited, which is listed in India" },
    ],
    sources: [
      { name: "Forbes Middle East profile", url: "https://www.forbesmiddleeast.com/lists/top-real-estate-developers-in-mena/sobha-realty/" },
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Sobha_LLC" },
    ],
    checked: "October 2026",
  },
];

const BY_SLUG = new Map(DEVELOPER_PROFILES.map((profile) => [profile.slug, profile]));

export function getDeveloperProfile(slug: string): DeveloperProfile | null {
  return BY_SLUG.get(slug) ?? null;
}
