import { GUIDES, guidePath } from "../seo/guides.ts";
import { CONSULTANT_PAGES, consultantPath } from "../seo/consultant-pages.ts";
import { DELAY_TOOL_FAQ, DELAY_TOOL_PATH, EMI_TOOL_FAQ, EMI_TOOL_PATH, GLOSSARY, GLOSSARY_PATH } from "../seo/tools.ts";
import { BUY_DIRECT_STEPS, buyDirectMarkets, buyDirectPath, BUY_DIRECT_PATH } from "../developer-connect/buy-direct-guides.ts";
import { DUBAI_LAND_DEPARTMENT, MAHARERA } from "../seo/sources.ts";
import type { Block, Guide } from "../seo/types.ts";

/**
 * Everything the "Ask Developer Connects" assistant is allowed to answer from: the site's own published guides, glossary, city
 * pages, regulator facts and tool explanations, cut into passages. It never answers from anything else.
 *
 * Built from the same data the pages, the sitemap and llms-full.txt use, so the assistant can never say something the site does
 * not already publish, and a corrected guide corrects the assistant at the same time. No database is read: this is plain
 * in-code data, so it costs no Firestore reads.
 */

export type PassageMarket = "india" | "dubai" | "both";

export interface Passage {
  id: string;
  /** Shown to the reader as the source name. */
  title: string;
  /** Path on this site (or the regulator's own site for a regulator fact). */
  url: string;
  kind: "guide" | "faq" | "glossary" | "city" | "regulator" | "tool" | "process";
  market: PassageMarket;
  text: string;
  /** ISO date the facts were last checked, when the source records one. */
  updated?: string;
}

const MAX_CHARS = 1400;

function marketOfGuide(market: Guide["market"]): PassageMarket {
  return market === "mumbai" ? "india" : market === "dubai" ? "dubai" : "both";
}

function blockText(block: Block): string {
  switch (block.t) {
    case "h2":
    case "h3":
      return block.text;
    case "p":
      return block.text;
    case "ul":
      return block.items.map((i) => `- ${i}`).join("\n");
    case "ol":
      return block.items.map((i, n) => `${n + 1}. ${i}`).join("\n");
    case "note":
      return `${block.title}: ${block.text}`;
  }
}

/** Splits long text at paragraph boundaries so no passage is larger than MAX_CHARS. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let current = "";
  for (const piece of text.split("\n")) {
    if (current && current.length + piece.length + 1 > MAX_CHARS) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function guidePassages(guide: Guide): Passage[] {
  const url = guidePath(guide);
  const market = marketOfGuide(guide.market);
  const base = { title: guide.title, url, market, updated: guide.updated } as const;
  const out: Passage[] = [{ ...base, id: `guide:${guide.slug}:summary`, kind: "guide", text: guide.summary }];

  // One passage per section (an h2 and everything under it).
  let heading = "";
  let body: string[] = [];
  let section = 0;
  const flush = () => {
    if (body.length === 0) return;
    const text = `${heading ? `${heading}\n` : ""}${body.join("\n")}`;
    splitLong(text).forEach((chunk, i) => out.push({ ...base, id: `guide:${guide.slug}:s${section}-${i}`, kind: "guide", text: chunk }));
    section += 1;
    body = [];
  };
  for (const block of guide.blocks) {
    if (block.t === "h2") {
      flush();
      heading = block.text;
    } else {
      body.push(blockText(block));
    }
  }
  flush();

  guide.faq.forEach((f, i) => out.push({ ...base, id: `guide:${guide.slug}:faq${i}`, kind: "faq", text: `${f.question}\n${f.answer}` }));
  return out;
}

let cached: Passage[] | null = null;

export function buildCorpus(): Passage[] {
  if (cached) return cached;
  const out: Passage[] = [];

  for (const guide of GUIDES) out.push(...guidePassages(guide));

  for (const term of GLOSSARY) {
    out.push({
      id: `glossary:${term.id}`,
      title: `Property glossary: ${term.term}`,
      url: `${GLOSSARY_PATH}#${term.id}`,
      kind: "glossary",
      market: term.market === "India" ? "india" : term.market === "Dubai" ? "dubai" : "both",
      text: `${term.term}: ${term.definition}`,
    });
  }

  for (const page of CONSULTANT_PAGES) {
    const market: PassageMarket = page.market === "mumbai" ? "india" : "dubai";
    const url = consultantPath(page);
    const areas = page.areaGroups.map((g) => `${g.heading}: ${g.areas.join(", ")}`).join("\n");
    out.push({ id: `city:${page.slug}:overview`, title: page.title, url, kind: "city", market, text: `${page.intro}\nHow Developer Connects helps: ${page.helpWith.join("; ")}.` });
    out.push({ id: `city:${page.slug}:areas`, title: `${page.title}: areas covered`, url, kind: "city", market, text: areas });
    out.push({ id: `city:${page.slug}:regulator`, title: `${page.title}: regulator`, url, kind: "regulator", market, text: `${page.regulator.name}: ${page.regulator.check}` });
    page.faq.forEach((f, i) => out.push({ id: `city:${page.slug}:faq${i}`, title: page.title, url, kind: "faq", market, text: `${f.question}\n${f.answer}` }));
  }

  for (const market of buyDirectMarkets()) {
    const m: PassageMarket = market.location.country === "India" ? "india" : "dubai";
    const url = buyDirectPath(market);
    out.push({
      id: `market:${market.slug}:regulator`,
      title: `Researching a developer in ${market.name}`,
      url,
      kind: "regulator",
      market: m,
      text: `Regulator for ${market.name}: ${market.regulator.name}${market.regulator.url ? ` (${market.regulator.url})` : ""}. ${market.regulator.check}`,
    });
    if (market.tips.length > 0) {
      out.push({ id: `market:${market.slug}:tips`, title: `Researching a developer in ${market.name}`, url, kind: "process", market: m, text: market.tips.join("\n") });
    }
  }

  BUY_DIRECT_STEPS.forEach((step, i) =>
    out.push({ id: `process:step${i}`, title: "How to research a developer before you buy", url: BUY_DIRECT_PATH, kind: "process", market: "both", text: `${step.title}\n${step.body}` }),
  );

  out.push({ id: "regulator:maharera", title: MAHARERA.name, url: MAHARERA.url, kind: "regulator", market: "india", text: `${MAHARERA.name}: ${MAHARERA.use}` });
  out.push({ id: "regulator:dld", title: DUBAI_LAND_DEPARTMENT.name, url: DUBAI_LAND_DEPARTMENT.url, kind: "regulator", market: "dubai", text: `${DUBAI_LAND_DEPARTMENT.name}: ${DUBAI_LAND_DEPARTMENT.use}` });

  EMI_TOOL_FAQ.forEach((f, i) => out.push({ id: `tool:emi:faq${i}`, title: "Home loan EMI calculator", url: EMI_TOOL_PATH, kind: "tool", market: "both", text: `${f.question}\n${f.answer}` }));
  DELAY_TOOL_FAQ.forEach((f, i) => out.push({ id: `tool:delay:faq${i}`, title: "Possession delay interest calculator", url: DELAY_TOOL_PATH, kind: "tool", market: "india", text: `${f.question}\n${f.answer}` }));

  cached = out;
  return out;
}
