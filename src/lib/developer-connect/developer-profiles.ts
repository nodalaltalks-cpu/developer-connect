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
  // --- Western Mumbai ---
  {
    slug: "oberoi-realty",
    summary: "Oberoi Realty is a Mumbai developer based in Goregaon East and listed on the NSE and BSE.",
    facts: [
      { label: "Based in", value: "Oberoi Garden City, Goregaon East, Mumbai" },
      { label: "Incorporated", value: "1998, originally as Kingston Properties; renamed Oberoi Realty in 2009" },
      { label: "Listed", value: "NSE (OBEROIRLTY) and BSE (533273)" },
      { label: "Known projects", value: "Oberoi Garden City and Esquire in Goregaon East, Sky City in Borivali East, and Three Sixty West in Worli" },
    ],
    sources: [
      { name: "Arihant Capital company background", url: "https://www.arihantcapital.com/company-information/company-background/38025" },
      { name: "NSE company filing", url: "https://nsearchives.nseindia.com/corporate/OBEROIRLTY_15032025235919_SkycityMall.pdf" },
    ],
    checked: "October 2026",
  },
  {
    slug: "kalpataru",
    summary: "Kalpataru Limited is a Mumbai real estate developer that builds residential, commercial and township projects across several Indian cities.",
    facts: [
      { label: "Based in", value: "Mumbai" },
      { label: "Incorporated", value: "1988, as Kalpataru Homes Private Limited; renamed Kalpataru Limited in 2008" },
      { label: "Listed", value: "NSE and BSE, since July 2025" },
      { label: "Known projects", value: "Kalpataru Solitaire in Juhu, Kalpataru Parkcity in Thane and Kalpataru Riverside in Panvel" },
      { label: "Note", value: "Kalpataru Limited is separate from Kalpataru Projects International, the group's listed engineering company" },
    ],
    sources: [
      { name: "Motilal Oswal IPO note", url: "https://www.motilaloswal.com/learning-centre/2024/8/kalpataru-ltd-files-for-rs-1-590-crore-ipo-to-reduce-debt-and-fuel-growth" },
      { name: "5paisa listing report", url: "https://www.5paisa.com/news/kalpataru-ipo-listing-flat-debut" },
    ],
    checked: "October 2026",
  },
  {
    slug: "wadhwa-group",
    summary: "Wadhwa Group is a Mumbai developer with a corporate office in Bandra Kurla Complex and projects across the city's suburbs.",
    facts: [
      { label: "Based in", value: "Platina, Bandra Kurla Complex, Mumbai" },
      { label: "Began", value: "1969, according to company listings" },
      { label: "Known projects", value: "The Capital in Bandra Kurla Complex, W54 in Matunga West, Anmol Fortune in Goregaon West and The Address in Ghatkopar West" },
    ],
    sources: [
      { name: "CB Insights company profile", url: "https://www.cbinsights.com/company/wadhwa-group" },
      { name: "PropertyPistol developer page", url: "https://www.propertypistol.com/developers/9b9c8380-af20-439b-8828-374667eb30b4/wadhwa-group" },
    ],
    checked: "October 2026",
  },
  {
    slug: "kanakia-group",
    summary: "Kanakia Group is a Mumbai developer whose flagship company is Kanakia Spaces, founded by Rasesh B. Kanakia.",
    facts: [
      { label: "Based in", value: "Mumbai" },
      { label: "Began", value: "1986, with Kanakia Spaces" },
      { label: "Known projects", value: "Kanakia Rainforest, Kanakia Paris and Kanakia Wall Street" },
      { label: "Also in", value: "Education and hospitality; in 2025 it announced a joint venture for an office project in Bandra Kurla Complex" },
    ],
    sources: [
      { name: "PropertyPistol developer page", url: "https://www.propertypistol.com/developers/d2e58e01-a559-494b-a85e-84ba4eba2f82/kanakia-space-pvt-ltd" },
      { name: "The Realty Today report", url: "https://therealtytoday.com/news/kanakia-group-joins-hines-mitsubishi-and-sumitomo-for-15-million-sq-ft-bkc-office-project" },
    ],
    checked: "October 2026",
  },
  {
    slug: "s-raheja-realty",
    summary: "S Raheja Realty is a Mumbai developer focused mainly on luxury housing, led by Ram Raheja.",
    facts: [
      { label: "Based in", value: "Bandra West, Mumbai" },
      { label: "Began", value: "2003, started by Shyam Raheja; the family's property business dates to 1955" },
      { label: "Known projects", value: "S Raheja Shree Pooja in Juhu and S Raheja Natraj in Khar West" },
      { label: "Note", value: "S Raheja Realty is a separate company from K Raheja Realty, though both come from the same family" },
    ],
    sources: [
      { name: "YourStory profile", url: "https://yourstory.com/smbstory/luxury-housing-mumbai-raheja-real-estate" },
      { name: "Wikipedia (K. Raheja Realty)", url: "https://en.wikipedia.org/wiki/K._Raheja_Realty" },
    ],
    checked: "October 2026",
  },
  {
    slug: "lokhandwala-group",
    summary: "Lokhandwala Group is a Mumbai developer whose name is also the name of Lokhandwala Complex, the Andheri West neighbourhood it developed.",
    facts: [
      { label: "Based in", value: "Versova, Andheri West, Mumbai" },
      { label: "Known for", value: "Developing the Lokhandwala Complex area of Andheri West, on former marshland at Versova" },
      { label: "Early land", value: "Siraj Lokhandwala bought the Versova land in 1968, according to Wikipedia" },
    ],
    sources: [
      { name: "Wikipedia (Lokhandwala Complex)", url: "https://en.wikipedia.org/wiki/Lokhandwala_Complex" },
      { name: "Square Yards builder page", url: "https://www.squareyards.com/lokhandwala-construction-projects/8286/builder" },
    ],
    checked: "October 2026",
  },
  // --- South Mumbai ---
  {
    slug: "piramal-realty",
    summary: "Piramal Realty is the real estate arm of the Piramal Group, with residential projects in South and central Mumbai and in Thane.",
    facts: [
      { label: "Part of", value: "Piramal Group" },
      { label: "Known projects", value: "Piramal Mahalaxmi in Mahalaxmi, Piramal Aranya in Byculla, Piramal Revanta in Mulund West and Piramal Vaikunth in Thane" },
      { label: "Markets", value: "Mumbai and Thane" },
    ],
    sources: [
      { name: "Piramal Realty project pages", url: "https://www.piramalrealty.com/new-projects-in-mumbai" },
      { name: "Square Yards builder page", url: "https://www.squareyards.com/ready-to-move-by-piramal-realty-in-mumbai" },
    ],
    checked: "October 2026",
  },
  {
    slug: "birla-estates",
    summary: "Birla Estates is the real estate arm of Aditya Birla Real Estate, formerly Century Textiles and Industries, with a base in Worli.",
    facts: [
      { label: "Part of", value: "Aditya Birla Real Estate (renamed from Century Textiles and Industries in 2024)" },
      { label: "Based in", value: "Worli, Mumbai" },
      { label: "Known projects", value: "Birla Niyaara and Birla Aurora in Worli, and Birla Vanya in Kalyan" },
    ],
    sources: [
      { name: "Aditya Birla Group company page", url: "https://adityabirla.com/businesses/companies/century-textiles" },
      { name: "Business Standard report", url: "https://www.business-standard.com/amp/markets/news/century-textiles-hits-life-high-after-buying-rs-1-100-cr-land-in-mumbai-124091100250_1.html" },
    ],
    checked: "October 2026",
  },
  {
    slug: "peninsula-land",
    summary: "Peninsula Land is a Mumbai developer in the Ashok Piramal Group, with its office in Lower Parel and shares listed on the NSE and BSE.",
    facts: [
      { label: "Based in", value: "Peninsula Business Park, Lower Parel, Mumbai" },
      { label: "Part of", value: "Ashok Piramal Group" },
      { label: "Listed", value: "NSE (PENINLAND) and BSE (503031)" },
      { label: "Known projects", value: "Peninsula Business Park, Ashok Towers in Parel, Peninsula AshokVann and Ashok Gardens" },
    ],
    sources: [
      { name: "Arihant Capital company background", url: "https://www.arihantcapital.com/company-information/company-background/390" },
      { name: "NSE press release", url: "https://nsearchives.nseindia.com/corporate/PENINLAND_01072026160828_Regulation_30_Press_Release.pdf" },
    ],
    checked: "October 2026",
  },
  {
    slug: "mahindra-lifespaces",
    summary: "Mahindra Lifespaces is the real estate arm of the Mahindra Group, headquartered in Worli, Mumbai, and listed on the NSE and BSE.",
    facts: [
      { label: "Based in", value: "Mahindra Towers, Worli, Mumbai" },
      { label: "Listed", value: "NSE (MAHLIFE) and BSE (532313)" },
      { label: "Origin", value: "Began as the real estate division of Great Eastern Shipping; spun off in 1999 and renamed Mahindra Lifespace Developers in 2007" },
      { label: "Known projects", value: "Roots in Kandivali, Vicino in Andheri, Happinest Kalyan, and Mahindra World City in Chennai" },
    ],
    sources: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Mahindra_Lifespaces" },
      { name: "BSE annual report", url: "https://bseindia.com/bseplus/AnnualReport/532313/5323130319.pdf" },
    ],
    checked: "October 2026",
  },
  {
    slug: "marathon-group",
    summary: "Marathon Group is a Mumbai developer with a long record in Lower Parel and Mulund. Its listed company is Marathon Nextgen Realty.",
    facts: [
      { label: "Began", value: "1969, according to the Marathon Nextgen Realty annual report" },
      { label: "Listed company", value: "Marathon Nextgen Realty, NSE (MARATHON) and BSE (503101)" },
      { label: "Known projects", value: "Marathon Futurex in Lower Parel, Monte Carlo in Mulund West, and Monte South in Byculla, a joint venture with Adani Realty" },
    ],
    sources: [
      { name: "NSE company filing", url: "https://nsearchives.nseindia.com/corporate/MARATHON_24022023132948_MNRL.pdf" },
      { name: "Morningstar company profile", url: "https://dfd.dr.morningstar.com.au/investments/security/NSE/MARATHON" },
    ],
    checked: "October 2026",
  },
  {
    slug: "shapoorji-pallonji-real-estate",
    summary: "Shapoorji Pallonji Real Estate is the real estate division of Shapoorji Pallonji and Company, with projects across Indian cities.",
    facts: [
      { label: "Part of", value: "Shapoorji Pallonji and Company" },
      { label: "Known projects", value: "The Odyssey in South Mumbai and BKC 9 in Bandra East, a joint venture with Vakratunda Buildcon" },
      { label: "Markets", value: "Mumbai, Pune, Bengaluru, Gurugram and Kolkata" },
    ],
    sources: [
      { name: "Outlook Business report", url: "https://www.outlookbusiness.com/news/shapoorji-pallonji-real-estate-expects-over-rs-1000-crore-revenue-from-its-luxury-project-in-mumbai" },
      { name: "Business Standard report", url: "https://www.business-standard.com/amp/industry/news/shapoorji-pallonji-real-estate-eyes-rs-250-cr-revenue-from-new-project-124020600315_1.html" },
    ],
    checked: "October 2026",
  },
  {
    slug: "dosti-realty",
    summary: "Dosti Realty is a Mumbai developer whose first landmark project was Dosti Acres in New Wadala.",
    facts: [
      { label: "Based in", value: "Fort, Mumbai, according to its listing" },
      { label: "Began", value: "In New Wadala, with Dosti Acres" },
      { label: "Known projects", value: "Dosti Acres and Dosti Eastern Bay in New Wadala, and Dosti West County in Balkum, Thane" },
    ],
    sources: [
      { name: "Company press release (Plant Automation Technology)", url: "https://www.plantautomation-technology.com/pressreleases/dosti-realty-eyes-rs-2000-cr-revenue-as-it-launches-a-landmark-project-in-new-wadala-dosti-eastern-bay" },
      { name: "Gharpe builder listing", url: "https://gharpe.com/mumbai/dosti-eastern-bay-phase-2" },
    ],
    checked: "October 2026",
  },
];

const BY_SLUG = new Map(DEVELOPER_PROFILES.map((profile) => [profile.slug, profile]));

export function getDeveloperProfile(slug: string): DeveloperProfile | null {
  return BY_SLUG.get(slug) ?? null;
}
