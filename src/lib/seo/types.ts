/**
 * The shapes shared by the guides and the city consultant pages. Content is plain data (no markup) so the page template, the
 * structured data, the sitemap and llms.txt are all built from the same words and can never drift apart.
 */

export type Block =
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: readonly string[] }
  | { t: "ol"; items: readonly string[] }
  /** A short boxed point: a warning, a rule of thumb, or "check this before you pay". */
  | { t: "note"; title: string; text: string };

export interface FaqEntry {
  question: string;
  answer: string;
}

export type GuideTopic = "Buying process" | "Costs and money" | "Mumbai" | "Mumbai neighbourhoods" | "Dubai" | "Dubai communities" | "NRI and overseas" | "Choosing an advisor";

export interface Guide {
  slug: string;
  topic: GuideTopic;
  /** The page's h1. */
  title: string;
  /** The <title> (without the site suffix). Under about 60 characters where possible. */
  metaTitle: string;
  /** The meta description, 120 to 160 characters. */
  description: string;
  /** The answer in two sentences, shown first (and reused as the summary in structured data). */
  summary: string;
  market: "mumbai" | "dubai" | "both";
  blocks: readonly Block[];
  faq: readonly FaqEntry[];
  /** For a neighbourhood guide: the area name exactly as it appears in a city page's "Areas we cover" list, which then links here. */
  area?: string;
  /** Slugs of other guides to link to at the end. */
  related: readonly string[];
  /** ISO date the facts in the guide were last checked. Shown on the page and used as dateModified. */
  updated: string;
}
