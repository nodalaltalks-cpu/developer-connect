import type { Market } from "./hero-market.ts";

/**
 * Everything the public site says about the founder, in one reviewed place. Every line here is a statement of the founder's
 * PROFESSIONAL EXPERIENCE, authorised by the founder, and each is worded so that it cannot be read as a Developer Connects
 * statistic:
 *
 *  - developerNetwork: relationships the founder built over a career. It is NOT a count of developers listed, active or verified on
 *    this platform (the directory is a different, smaller number) and must never sit next to one.
 *  - transactedValue: property value the founder personally contributed to over a real estate career. It is NOT Developer Connects
 *    revenue, transaction volume or GMV, and the wording never says "revenue", "volume" or "we". A named employer is added only
 *    when the supporting evidence for that specific period is on file.
 *  - education: stated as the founder gave it ("MBA completed in Dubai"). No university, specialisation, date or distinction is
 *    added, because none is in the project data.
 *  - linkedinUrl: the founder's real profile. Nothing is scraped from it (no follower count).
 *
 * The first person is deliberately avoided and no pronoun is used, so the lines read the same on every page.
 */
export const FOUNDER = {
  name: "Ambish Singh",
  role: "Founder, Developer Connects",
  /** The facts shown on the founder card, in order. Each is a complete, self-contained statement. */
  facts: [
    "6+ years of real estate experience across India and the UAE.",
    "Built relationships across a network of 10,000+ developers.",
    "Personally contributed to ₹300 Cr+ in property transactions during a real estate career.",
    "MBA completed in Dubai.",
  ],
  /** Shown beside the facts so they are never mistaken for platform statistics. */
  context: "Founder experience, not Developer Connects platform statistics.",
  linkedinUrl: "https://www.linkedin.com/in/ambishsingh",
} as const;

/** The same sentence used on the advisor page and in structured descriptions. */
export const FOUNDER_EXPERIENCE = FOUNDER.facts[0];

export interface FounderStory {
  id: string;
  /** "any" is shown in every market; otherwise only for that market. */
  market: Market | "any";
  title: string;
  body: string;
}

/**
 * The APPROVED story library. Only text the founder has supplied or approved goes here; nothing is generated and nothing is
 * rewritten per visit. Rotation just chooses between approved entries, so adding a real Mumbai or Dubai story later makes the
 * site rotate automatically.
 *
 * Pending (needs the founder's own words, not drafted by us): a Mumbai story and a Dubai story.
 */
export const FOUNDER_STORIES: readonly FounderStory[] = [
  {
    id: "gap",
    market: "any",
    title: "Why Developer Connects exists",
    body: "Working in real estate showed the gap between what buyers want to know and what they are usually told. Developer Connects was built to make property research calmer, clearer and more human.",
  },
];

/** Deterministic: the same visit number always gives the same story, and visits cycle through the approved entries. */
export function pickFounderStory(market: Market, visit: number, library: readonly FounderStory[] = FOUNDER_STORIES): FounderStory {
  const pool = library.filter((s) => s.market === market || s.market === "any");
  const choices = pool.length > 0 ? pool : library;
  const index = ((Math.floor(visit) % choices.length) + choices.length) % choices.length;
  return choices[index];
}
