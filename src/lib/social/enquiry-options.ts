/**
 * The tap-to-select enquiry form: every question and every answer, defined ONCE. The form renders these, the server validates
 * against these (a value that is not in the list is refused, so nothing free-typed can reach the database), and the Founder's
 * enquiries page reads the labels back from here. A visitor types only their number (and, if they like, a name).
 */

export interface Option<K extends string = string> {
  key: K;
  label: string;
}

const opts = <K extends string>(...pairs: Array<[K, string]>): Option<K>[] => pairs.map(([key, label]) => ({ key, label }));

export const INTENTS = opts(["BUY", "Buy a property"], ["INVEST", "Invest in property"], ["RENT_IN", "Rent a property"], ["SELL", "Sell my property"], ["RENT_OUT", "Rent out my property"]);
export type IntentKey = "BUY" | "INVEST" | "RENT_IN" | "SELL" | "RENT_OUT";

export const MARKETS = opts(["MUMBAI", "Mumbai"], ["DUBAI", "Dubai"], ["OTHER", "Somewhere else"]);
export type MarketKey = "MUMBAI" | "DUBAI" | "OTHER";

/** Areas to tap, per market. Up to MAX_LOCATIONS can be chosen. */
export const LOCATIONS: Record<MarketKey, Option[]> = {
  MUMBAI: opts(
    ["SOUTH_MUMBAI", "South Mumbai"],
    ["CENTRAL_MUMBAI", "Central Mumbai"],
    ["WESTERN_SUBURBS", "Western suburbs"],
    ["EASTERN_SUBURBS", "Eastern suburbs"],
    ["THANE", "Thane"],
    ["NAVI_MUMBAI", "Navi Mumbai"],
    ["MIRA_BHAYANDAR", "Mira Road / Bhayandar"],
    ["VASAI_VIRAR", "Vasai / Virar"],
    ["PANVEL_KHARGHAR", "Panvel / Kharghar"],
    ["ANY_MUMBAI", "Open to suggestions"],
  ),
  DUBAI: opts(
    ["DOWNTOWN", "Downtown Dubai"],
    ["MARINA_JBR", "Dubai Marina / JBR"],
    ["BUSINESS_BAY", "Business Bay"],
    ["PALM_JUMEIRAH", "Palm Jumeirah"],
    ["JVC", "Jumeirah Village Circle"],
    ["DUBAI_HILLS", "Dubai Hills"],
    ["CREEK_HARBOUR", "Dubai Creek Harbour"],
    ["ANY_DUBAI", "Open to suggestions"],
  ),
  OTHER: opts(["PUNE", "Pune"], ["BENGALURU", "Bangalore"], ["GOA", "Goa"], ["ABU_DHABI", "Abu Dhabi"], ["OTHER_PLACE", "Another place"]),
};
export const MAX_LOCATIONS = 3;

export const PROPERTY_TYPES = opts(["APARTMENT", "Apartment"], ["VILLA", "Villa / independent house"], ["PLOT", "Plot / land"], ["OFFICE", "Office"], ["SHOP", "Shop / retail"]);

export const CONFIGURATIONS = opts(["STUDIO", "Studio / 1 RK"], ["1BHK", "1 BHK"], ["2BHK", "2 BHK"], ["3BHK", "3 BHK"], ["4PLUS", "4 BHK or more"], ["NOT_SURE", "Not sure yet"]);
export const MAX_CONFIGURATIONS = 2;

export interface BudgetBand extends Option {
  min: number | null;
  max: number | null;
}
/** Budget bands, per currency. India is in rupees, Dubai in dirhams: the two are never mixed or converted. */
export const BUDGETS: Record<"INR" | "AED", BudgetBand[]> = {
  INR: [
    { key: "INR_U50L", label: "Under ₹50 lakh", min: null, max: 5_000_000 },
    { key: "INR_50L_1CR", label: "₹50 lakh – 1 crore", min: 5_000_000, max: 10_000_000 },
    { key: "INR_1_2CR", label: "₹1 – 2 crore", min: 10_000_000, max: 20_000_000 },
    { key: "INR_2_3CR", label: "₹2 – 3 crore", min: 20_000_000, max: 30_000_000 },
    { key: "INR_3_5CR", label: "₹3 – 5 crore", min: 30_000_000, max: 50_000_000 },
    { key: "INR_5_10CR", label: "₹5 – 10 crore", min: 50_000_000, max: 100_000_000 },
    { key: "INR_10CR_PLUS", label: "Above ₹10 crore", min: 100_000_000, max: null },
  ],
  AED: [
    { key: "AED_U500K", label: "Under AED 500K", min: null, max: 500_000 },
    { key: "AED_500K_1M", label: "AED 500K – 1M", min: 500_000, max: 1_000_000 },
    { key: "AED_1_2M", label: "AED 1 – 2M", min: 1_000_000, max: 2_000_000 },
    { key: "AED_2_3M", label: "AED 2 – 3M", min: 2_000_000, max: 3_000_000 },
    { key: "AED_3_5M", label: "AED 3 – 5M", min: 3_000_000, max: 5_000_000 },
    { key: "AED_5M_PLUS", label: "Above AED 5M", min: 5_000_000, max: null },
  ],
};

export const PURPOSES = opts(["SELF_USE", "To live in it"], ["INVESTMENT", "As an investment"]);
export const TIMELINES = opts(
  ["WITHIN_30_DAYS", "Within a month"],
  ["ONE_TO_THREE_MONTHS", "1 to 3 months"],
  ["THREE_TO_SIX_MONTHS", "3 to 6 months"],
  ["SIX_MONTHS_PLUS", "More than 6 months"],
  ["JUST_EXPLORING", "Just exploring"],
);
export const POSSESSIONS = opts(["READY", "Ready to move in"], ["UNDER_CONSTRUCTION", "Under construction"], ["EITHER", "Either is fine"]);
export const LOANS = opts(["YES", "Yes, I need a home loan"], ["NO", "No, self-funded"], ["NOT_SURE", "Not sure yet"]);
export const CONTACT_METHODS = opts(["WHATSAPP", "WhatsApp"], ["PHONE_CALL", "Phone call"]);
export const CONTACT_TIMES = opts(["MORNING", "Morning (9–12)"], ["AFTERNOON", "Afternoon (12–4)"], ["EVENING", "Evening (4–8)"], ["ANYTIME", "Any time"]);
export const HOW_FOUND = opts(
  ["INSTAGRAM", "Instagram"],
  ["YOUTUBE", "YouTube"],
  ["FACEBOOK", "Facebook"],
  ["LINKEDIN", "LinkedIn"],
  ["GOOGLE", "Google search"],
  ["FRIEND", "A friend or family"],
  ["OTHER", "Somewhere else"],
);

/** Every question the Founder sees back, in the order they are asked. */
export const QUESTION_LABELS: Record<string, string> = {
  intent: "Looking to",
  market: "City",
  locations: "Areas",
  propertyType: "Property type",
  configurations: "Size",
  budget: "Budget",
  purpose: "Purpose",
  timeline: "Timeline",
  possession: "Possession",
  loan: "Home loan",
  contactMethod: "Prefers",
  contactTime: "Best time",
  howFound: "Found us through",
};

const ALL: Record<string, Option[]> = {
  intent: INTENTS,
  market: MARKETS,
  propertyType: PROPERTY_TYPES,
  purpose: PURPOSES,
  timeline: TIMELINES,
  possession: POSSESSIONS,
  loan: LOANS,
  contactMethod: CONTACT_METHODS,
  contactTime: CONTACT_TIMES,
  howFound: HOW_FOUND,
};

const labelIn = (list: readonly Option[], key: string): string => list.find((o) => o.key === key)?.label ?? key;

/** A stored answer set, turned into "Question: answer" lines for the Founder. Unknown keys are shown as stored, never dropped. */
export function describeAnswers(answers: Record<string, unknown>): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  const market = typeof answers.market === "string" ? (answers.market as MarketKey) : null;
  for (const [field, question] of Object.entries(QUESTION_LABELS)) {
    const value = answers[field];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) continue;
    let answer: string;
    if (field === "locations" && Array.isArray(value)) {
      const pool = market && LOCATIONS[market] ? LOCATIONS[market] : Object.values(LOCATIONS).flat();
      answer = value.map((v) => labelIn(pool, String(v))).join(", ");
    } else if (field === "configurations" && Array.isArray(value)) {
      answer = value.map((v) => labelIn(CONFIGURATIONS, String(v))).join(", ");
    } else if (field === "budget") {
      answer = labelIn([...BUDGETS.INR, ...BUDGETS.AED], String(value));
    } else if (ALL[field]) {
      answer = labelIn(ALL[field], String(value));
    } else {
      answer = String(value);
    }
    out.push({ question, answer });
  }
  return out;
}
