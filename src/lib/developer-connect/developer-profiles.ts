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
  {
    slug: "acme-group",
    summary: "Acme Group is a Mumbai developer with residential and commercial projects across the western and central suburbs.",
    facts: [
      { label: "Based in", value: "Chakala, Andheri East, Mumbai" },
      { label: "Began", value: "1976, according to property listings" },
      { label: "Known projects", value: "Acme Ozone in Thane, Acme Regency in Vile Parle West, Acme Elanza in Ghatkopar West and Acme Aurum in Kandivali West" },
    ],
    sources: [
      { name: "CommonFloor builder page", url: "https://www.commonfloor.com/acme-group/builder/a1i3pw" },
      { name: "PropertyPistol developer page", url: "https://www.propertypistol.com/developers/aad6baa8-34d1-47e6-a119-5874e2517819/acme-group" },
    ],
    checked: "October 2026",
  },
  {
    slug: "adani-realty",
    summary: "Adani Realty is the real estate arm of the Adani Group, with office and residential projects in Mumbai.",
    facts: [
      { label: "Part of", value: "Adani Group" },
      { label: "Known projects", value: "Adani Inspire in Bandra Kurla Complex and Adani Monte South in Byculla West" },
      { label: "Works in", value: "Office towers and residential projects in Mumbai" },
    ],
    sources: [
      { name: "Business Standard (PTI) report", url: "https://www.business-standard.com/article/pti-stories/adani-realty-to-launch-1-5-mn-sqft-of-comm-spaces-in-6-months-116021100981_1.html" },
      { name: "Ghar.tv developer profile", url: "https://www.ghar.tv/adani-inspire-bandra-east-mumbai-okiw94876177" },
    ],
    checked: "October 2026",
  },
  {
    slug: "sunteck-realty",
    summary: "Sunteck Realty is a Mumbai developer headquartered in Vile Parle East and listed on the NSE and BSE.",
    facts: [
      { label: "Based in", value: "Vile Parle East, Mumbai" },
      { label: "Listed", value: "NSE (SUNTECK) and BSE (512179)" },
      { label: "Known projects", value: "Signature Island in Bandra Kurla Complex, Sunteck City in Oshiwara, Goregaon, and SunteckWorld in Naigaon" },
    ],
    sources: [
      { name: "Sunteck's about page", url: "https://www.sunteckindia.com/about-us" },
      { name: "NSE company filing", url: "https://nsearchives.nseindia.com/corporate/SUNTECK_07092025004531_SRL.pdf" },
    ],
    checked: "October 2026",
  },
  {
    slug: "damac-properties",
    summary: "DAMAC Properties is a Dubai developer founded by Hussain Sajwani, known for master-planned communities in Dubailand.",
    facts: [
      { label: "Based in", value: "Dubai, United Arab Emirates" },
      { label: "Founder", value: "Hussain Sajwani" },
      { label: "Listed", value: "On the Dubai Financial Market from 2015 until it was taken private in 2022" },
      { label: "Known communities", value: "DAMAC Hills and DAMAC Hills 2, in Dubailand" },
    ],
    sources: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/DAMAC_Properties" },
      { name: "Business Chief profile of the founder", url: "https://businesschief.eu/leadership-and-strategy/damac-founder-hussain-sajwani-pioneer-in-dubai-property" },
    ],
    checked: "October 2026",
  },
  {
    slug: "samana-developers",
    summary: "Samana Developers is a Dubai developer led by its founder and CEO, Imran Farooq, with a head office in Business Bay.",
    facts: [
      { label: "Based in", value: "Bay Square, Business Bay, Dubai" },
      { label: "Founder and CEO", value: "Imran Farooq" },
      { label: "Known projects", value: "Samana Waves in Jumeirah Village Circle, Samana Greens in Arjan and Samana Golf Avenue in Dubai Studio City" },
    ],
    sources: [
      { name: "Tranio developer page", url: "https://tranio.com/developers-uae/samana/" },
      { name: "Entrepreneur Middle East profile", url: "https://mena.entrepreneur.com/entrepreneurs/the-100-imran-farooq-founder-and-ceo-samana-developers/501482" },
    ],
    checked: "October 2026",
  },
  {
    slug: "condor-developers",
    summary: "Condor Developers is the real estate arm of Condor Group, a Dubai-based group that traces its origins to 1983.",
    facts: [
      { label: "Based in", value: "Dubai, United Arab Emirates" },
      { label: "Group origin", value: "1983" },
      { label: "Completed projects", value: "Condor Castle and Condor Concept 7 in Jumeirah Village Circle, and Marina Star in Dubai Marina" },
      { label: "Newer projects", value: "Condor Golf Links 18 in Dubai Sports City and Sonate Residences in Jumeirah Village Triangle (launched July 2024)" },
    ],
    sources: [
      { name: "Khaleej Times", url: "https://www.khaleejtimes.com/supplements/condor-group-keeping-the-flag-of-quality-aloft?amp=1" },
      { name: "TradeArabia", url: "https://www.tradearabia.com/News/486611/Condor-completes-handover-of-Dubai-Sports-City-residential-project" },
    ],
    checked: "October 2026",
  },
];

const BY_SLUG = new Map(DEVELOPER_PROFILES.map((profile) => [profile.slug, profile]));

export function getDeveloperProfile(slug: string): DeveloperProfile | null {
  return BY_SLUG.get(slug) ?? null;
}
