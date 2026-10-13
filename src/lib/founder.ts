import type { Market } from "./hero-market.ts";

/**
 * Everything the public site says about the founder, in one reviewed place. Every line is the founder's own statement about their
 * professional experience, authorised by the founder. The aim of the founder section is CREDIBILITY, so the headline figures are
 * shown large and counting up (see `stats`), with the supporting facts beneath them.
 *
 *  - stats: the three headline numbers. "300+ Cr of property transactions successfully executed" is the founder's career figure,
 *    shown with "still counting". The 10,000+ is relationships the founder built across a developer network over a career; it is
 *    not a count of developers listed on this platform (the directory is a different, smaller number) and must not sit beside one.
 *  - facts: first-generation entrepreneur; 6+ years of hardcore real estate strategy and investment experience; four years at
 *    Square Yards; MBA in Strategy from Symbiosis International University, Dubai.
 *  - linkedinUrl: the founder's real profile. Nothing is scraped from it (no follower count).
 *
 * The first person is deliberately avoided and no pronoun is used, so the lines read the same on every page.
 */
export interface FounderStat {
  value: number;
  /** Shown before the number, e.g. the rupee sign. */
  prefix?: string;
  /** Shown after the number, e.g. " Cr+". */
  suffix: string;
  label: string;
  /** A short tag under the label, e.g. "Still counting". */
  note?: string;
}

export const FOUNDER = {
  name: "Ambish Singh",
  role: "Founder, Developer Connects",
  /** The headline numbers, shown large and rolling. */
  stats: [
    { value: 300, prefix: "₹", suffix: " Cr+", label: "worth of property transactions successfully executed", note: "Still counting" },
    { value: 6, suffix: "+", label: "years of hardcore real estate strategy and investment experience" },
    { value: 10000, suffix: "+", label: "developer relationships across the network" },
  ] satisfies readonly FounderStat[],
  /** The facts shown on the founder card, in order. Each is a complete, self-contained statement. */
  facts: [
    "First-generation real estate entrepreneur.",
    "6+ years of hardcore real estate strategy and investment experience.",
    "Worked at Square Yards for 4 years.",
    "MBA in Strategy from Symbiosis International University, Dubai.",
  ],
  /** The qualification as a short badge for the card. */
  education: "MBA in Strategy · 6+ years of experience in real estate across India & UAE",
  linkedinUrl: "https://www.linkedin.com/in/ambishsingh",
} as const;

/** The same sentence used on the advisor page and in structured descriptions. */
export const FOUNDER_EXPERIENCE = FOUNDER.facts[1];

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
