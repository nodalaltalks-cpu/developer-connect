/**
 * The Google Search playbook for a small budget, as data: settings to use, words to block, and ad copy that fits Google's limits and
 * this brand's rules. The admin page renders it; tests check every line, so a template can never be copied into Google Ads over the limit
 * or carrying a claim the brand does not make.
 */

export const HEADLINE_MAX = 30;
export const DESCRIPTION_MAX = 90;

/** Responsive search ad assets that need no project facts. {Project}, {Locality} and {RERA} are filled in by hand and re-counted. */
export const AD_HEADLINES = [
  "Get the Price Sheet Today",
  "Book a Site Visit",
  "MahaRERA Registered Project",
  "Talk to an Advisor Now",
  "Homes in Western Mumbai",
  "Check Possession Date",
  "Call or WhatsApp Us",
  "Floor Plans and Prices",
  "2 and 3 BHK Options",
  "Honest Property Advice",
] as const;

export const AD_DESCRIPTIONS = [
  "Get the price sheet, floor plans and possession date. An advisor replies in minutes.",
  "Registered with MahaRERA. Details as published by the developer. Visit by appointment.",
  "Not sure which size suits you? Tell us your budget and we will shortlist for you.",
  "Leave your number. We call or WhatsApp you between 9 am and 9 pm.",
] as const;

/** Headlines and descriptions that carry project facts. Check the character count after filling the braces. */
export const AD_FACT_TEMPLATES = {
  headlines: ["{Project} in {Locality}", "{Project} by {Developer}", "{Locality} Homes, MahaRERA {RERA}"],
  descriptions: ["{Project}, {Locality}. {Configurations}. Possession {Possession}. MahaRERA {RERA}."],
} as const;

/**
 * Words that bring clicks that cannot become a sale. Add as an ACCOUNT-level negative list. Review the search terms report every two
 * days for the first fortnight and add whatever else wastes money.
 */
export const NEGATIVE_KEYWORDS = [
  // not buying
  "rent", "rental", "rented", "lease", "pg", "paying guest", "hostel", "flatmate", "roommate", "on rent",
  // resale and second-hand listings are a different business
  "resale", "second hand", "old flat",
  // jobs and learning
  "job", "jobs", "career", "careers", "salary", "hiring", "vacancy", "internship", "course", "training", "license", "agent license",
  // research with no intent
  "pdf", "wikipedia", "meaning", "images", "photos", "video", "youtube", "reddit", "quora",
  // agents and channel partners looking for commission, not a home
  "commission", "channel partner", "channel partners", "cp", "payout", "dealer", "dealers", "associate", "referral program", "lead generation", "franchise", "partnership", "tie up",
  // listing portals and brokers: the searcher wants the portal, not us
  "99acres", "magicbricks", "housing.com", "nobroker", "olx", "commonfloor", "square yards", "broker", "brokers",
  // wrong money intent
  "free", "cheap", "lottery", "mhada lottery", "slum", "sra", "loan only", "home loan", "emi calculator",
  // wrong place or kind
  "plot", "land", "farm house", "commercial", "shop", "office space", "godown", "warehouse", "villa", "bungalow", "row house",
  "pune", "thane", "navi mumbai", "dubai", "bangalore", "delhi", "gurgaon", "hyderabad",
] as const;

/** Campaign settings that matter at ₹10,000 a month. */
export const CAMPAIGN_SETTINGS: ReadonlyArray<{ setting: string; value: string; why: string }> = [
  { setting: "Mode", value: "Expert Mode, a Search campaign with no goal template and no Smart campaign", why: "Smart campaigns hide search terms and spend freely; you need to see and block waste." },
  { setting: "Networks", value: "Google Search only. Untick Search Partners and the Display Network", why: "A small budget must buy only the high-intent surface." },
  { setting: "Locations", value: "Only the suburbs the project serves. Target 'Presence' (people in or regularly in), not 'Presence or interest'", why: "'Interest' brings people searching about Mumbai from anywhere." },
  { setting: "Language", value: "English and Hindi (add Marathi if the project is Marathi-leaning)", why: "Searchers type in all three." },
  { setting: "Daily budget", value: "About ₹300, never above ₹350. Keep ₹1,000 of the month in reserve", why: "Google can spend up to twice the daily budget on a day, and averages it over the month." },
  { setting: "Bidding (first 2-3 weeks)", value: "Manual CPC (or Maximise clicks with a maximum CPC cap), enhanced CPC off", why: "With no conversion history, automated bidding guesses. Move to Maximise conversions only after about 15 to 30 recorded leads." },
  { setting: "Ad schedule", value: "9 am to 9 pm, every day", why: "Pay only for clicks you can answer within minutes." },
  { setting: "Match types", value: "Exact [like this] and phrase \"like this\" only. No broad match", why: "Broad match on a small budget is how money disappears." },
  { setting: "Auto-tagging", value: "On (so every click carries a click id)", why: "The platform stores the click id on each lead, so Google clicks are always recognised." },
  { setting: "Conversion", value: "One 'Lead' conversion (website). Count one per click. Paste the AW id and label into the site settings", why: "Optimisation and reporting both depend on this one event." },
  { setting: "Final URL", value: "The project page https://developerconnects.com/project/<slug>, never the home page", why: "One project, one decision, one form." },
  { setting: "Tracking template", value: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign=<tag>&utm_term={keyword}&utm_content={creative}", why: "Tells the Campaigns and Acquisition pages which campaign, keyword and ad produced each lead." },
];

export const AD_GROUPS: ReadonlyArray<{ name: string; keywords: string; note: string }> = [
  { name: "1. Project name", keywords: "[project name], \"project name\", [project name locality], [project name price]", note: "Highest intent, cheapest leads. Start here." },
  { name: "2. Locality + size", keywords: "\"2 bhk in <locality>\", \"3 bhk in <locality>\", [flats in <locality>], \"new flats in <locality>\"", note: "Core demand. Add one locality per ad group so the ad can name it." },
  { name: "3. New launch / under construction", keywords: "\"new launch in <locality>\", \"under construction flats <locality>\", \"flats near <station>\"", note: "People earlier in the decision. Watch cost per qualified lead before keeping." },
];

export const WEEKLY_ROUTINE: readonly string[] = [
  "Every lead: call or WhatsApp within 2 minutes (9 am to 9 pm). Record the outcome in the lead (qualified, site visit, not interested).",
  "Every 2 days (first fortnight): read the search terms report, add every irrelevant term as a negative, and pause keywords that spent over ₹300 with no lead.",
  "Every Sunday: open Campaigns and Acquisition. Write down leads, qualified leads, site visits, spend. Cost per site visit is the number that matters.",
  "Never change more than one thing per week (budget, keywords or ad copy), so you know what moved the result.",
];

export const GATES: ReadonlyArray<{ when: string; pass: string; fail: string }> = [
  { when: "End of week 2", pass: "At least 6 leads and 2 site visits booked from them.", fail: "Fix keywords, ad copy or the page; do not add budget." },
  { when: "End of week 4", pass: "Cost per site visit is known and a booking is in progress.", fail: "Hold budget; revisit the project choice with the data." },
  { when: "Scaling", pass: "Raise the daily budget by about 20% at a time, only while cost per site visit holds.", fail: "Drop back to the last budget that worked." },
];

/** What each kind of waste costs and the cheapest thing that stops it. Google bills per click, not per lead, so waste has two prices: the click and your calling time. */
export const WASTE_CONTROLS: ReadonlyArray<{ waste: string; costs: string; stop: string }> = [
  { waste: "Agents and channel partners searching for commission", costs: "A click and a call", stop: "Commission and partner words are negatives; the page says it is for home buyers and gives agents an email; the alert flags names that read like a firm." },
  { waste: "Made-up numbers (9999999999, 9876543210)", costs: "Your calling time", stop: "The form refuses them, so nothing is saved and no alert fires." },
  { waste: "Searches that are not buying (rent, PG, jobs, resale)", costs: "A click", stop: "Account-level negative list; exact and phrase match only; review the search terms report every 2 days." },
  { waste: "Clicks from outside the target area, or while you cannot answer", costs: "A click", stop: "Location 'Presence' only, 9 am to 9 pm schedule, Search Partners and Display off." },
  { waste: "Repeat clicks from the same rival or bot", costs: "A click each time", stop: "Google filters invalid clicks and credits them automatically; report patterns you see to Google for a credit and add a repeat IP to the exclusion list. Paid click-fraud tools cost more than they save at ₹10,000 a month." },
  { waste: "Someone who is not serious about buying", costs: "Your calling time", stop: "The first WhatsApp message asks two questions (below). Log every outcome so you can see which keyword brings them, then block it." },
];

/** The first message after a lead arrives: it must read as a person, take 10 seconds to answer, and let a non-buyer drop out. */
export const FIRST_MESSAGE =
  "Hi {Name}, this is Ambish from Developer Connects about {Project}, {Locality}. Two quick questions so I send the right details: 1) Is this for your own use or investment? 2) Which size and roughly what budget are you looking at?";

export const OUTCOME_LOGGING: readonly string[] = [
  "Wrong or switched-off number: log the call as invalid number. It shows which source brings bad numbers.",
  "Agent or broker: set the lead to Unqualified and write 'agent' in the comment, so the pattern is searchable.",
  "Not interested after the first call: set Not interested. Open leads hide the real cost per qualified lead.",
  "Every Sunday, count junk leads against total leads for the week. If more than about 4 in 10 are junk, change keywords or ad copy before adding budget.",
];

export const PAUSE_RULES: readonly string[] = [
  "Pause a keyword that has spent more than twice your target cost per lead with no lead.",
  "Pause an ad group whose leads are all junk after 15 clicks, then read its search terms before turning it back on.",
  "Never add budget in a week that had more junk than buyers.",
];
