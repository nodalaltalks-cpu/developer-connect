import type { Market } from "./hero-market.ts";

/**
 * Everything the public site says about the founder, in one reviewed place. A claim appears on the site ONLY when it is
 * written here as text. Anything that is `null` is deliberately not shown anywhere until it has been substantiated and filled in.
 *
 *  - experience: approved by the founder ("6+ years of real-estate experience, India and UAE").
 *  - linkedinUrl: the founder's real profile, supplied by the founder. Nothing is scraped from it (no follower count).
 *  - education: NULL until the founder confirms the current status of the MBA exactly as it stands today.
 *  - transactedValue: NULL until the underlying sales records are reviewed. When filled, it must use the exact supported
 *    wording (e.g. "property value transacted", never "revenue").
 */
export const FOUNDER = {
  name: "Ambish Singh",
  role: "Founder, Developer Connects",
  experience: "6+ years in real estate across India and the UAE",
  linkedinUrl: "https://www.linkedin.com/in/ambishsingh",
  education: null as string | null,
  transactedValue: null as string | null,
} as const;

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
    body: "Working in real estate showed me the gap between what buyers want to know and what they are usually told. Developer Connects was built to make property research calmer, clearer and more human.",
  },
];

/** Deterministic: the same visit number always gives the same story, and visits cycle through the approved entries. */
export function pickFounderStory(market: Market, visit: number, library: readonly FounderStory[] = FOUNDER_STORIES): FounderStory {
  const pool = library.filter((s) => s.market === market || s.market === "any");
  const choices = pool.length > 0 ? pool : library;
  const index = ((Math.floor(visit) % choices.length) + choices.length) % choices.length;
  return choices[index];
}
