import { buildCorpus, type Passage, type PassageMarket } from "./corpus.ts";

/**
 * Finds the passages that answer a question (BM25 keyword ranking over the site's own content), and decides when NOTHING does.
 *
 * "Nothing does" matters as much as the ranking: when the question is not about property buying in India or Dubai, or our content
 * does not cover it, the assistant must say so instead of improvising. That decision is made here, in plain code, before any AI
 * model is called, so it is predictable, testable and costs nothing.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by can could did do does for from get got had has have how i if in into is it its me my of on or our so than that the their them then there these they this to us was we were what when where which who why will with would you your about after also any been being both each few more most other over same should some such too very just".split(" "),
);

/** Same-meaning words buyers and our guides use differently. */
const ALIASES: Record<string, string> = {
  apartment: "flat",
  apartments: "flat",
  flats: "flat",
  builder: "developer",
  builders: "developer",
  developers: "developer",
  possession: "possession",
  handover: "possession",
  rs: "rupee",
  inr: "rupee",
  rupees: "rupee",
  dirhams: "dirham",
  aed: "dirham",
};

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const aliased = ALIASES[raw] ?? raw;
    out.push(stem(aliased));
  }
  return out;
}

const DUBAI_WORDS = ["dubai", "uae", "emirates", "emirate", "abu", "dhabi", "dld", "oqood", "dirham", "aed", "ejari", "freehold", "trakheesi", "jvc", "marina", "downtown", "creek", "sharjah"];
const INDIA_WORDS = ["mumbai", "thane", "navi", "maharashtra", "india", "indian", "maharera", "rupee", "rupees", "inr", "lakh", "crore", "nri", "bandra", "powai", "andheri", "worli", "malad", "pune", "bangalore", "hyderabad", "gurugram", "mhada", "ready reckoner"];

/** Which market a question is about: "india", "dubai", or "both" when it names neither or both. */
export function detectMarket(query: string): PassageMarket {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
  const hit = (words: string[]) => words.some((w) => q.includes(` ${w} `) || q.includes(` ${w}s `));
  const dubai = hit(DUBAI_WORDS);
  const india = hit(INDIA_WORDS);
  if (dubai && !india) return "dubai";
  if (india && !dubai) return "india";
  return "both";
}

interface Index {
  passages: Passage[];
  termFreqs: Array<Map<string, number>>;
  lengths: number[];
  avgLength: number;
  docFreq: Map<string, number>;
}

let index: Index | null = null;

function getIndex(): Index {
  if (index) return index;
  const passages = buildCorpus();
  const termFreqs: Array<Map<string, number>> = [];
  const lengths: number[] = [];
  const docFreq = new Map<string, number>();
  for (const passage of passages) {
    // The title counts too, so a question that names a guide's subject finds it.
    const tokens = tokenize(`${passage.title} ${passage.text}`);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    termFreqs.push(tf);
    lengths.push(tokens.length);
    for (const term of tf.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  index = { passages, termFreqs, lengths, avgLength, docFreq };
  return index;
}

const K1 = 1.4;
const B = 0.75;

function idf(docFreq: number, total: number): number {
  return Math.log(1 + (total - docFreq + 0.5) / (docFreq + 0.5));
}

export interface RetrievedPassage extends Passage {
  score: number;
}

export interface Retrieval {
  passages: RetrievedPassage[];
  market: PassageMarket;
  /** 0 to 1: how much of the question's meaningful words the best passage covers. */
  coverage: number;
  /** False when the content does not really answer the question: the caller must decline, not guess. */
  answerable: boolean;
}

/** The share of the question's meaningful words (weighted by how rare they are) that the best passage covers must reach this to answer. */
export const MIN_COVERAGE = 0.4;

export interface RetrieveOptions {
  k?: number;
  /** The market the visitor chose, which overrides detection. */
  market?: PassageMarket;
}

export function retrieve(query: string, options: RetrieveOptions = {}): Retrieval {
  const { passages, termFreqs, lengths, avgLength, docFreq } = getIndex();
  const k = options.k ?? 6;
  const market = options.market && options.market !== "both" ? options.market : detectMarket(query);
  const queryTerms = [...new Set(tokenize(query))];
  const total = passages.length;

  if (queryTerms.length === 0) return { passages: [], market, coverage: 0, answerable: false };

  // A term the content has never seen counts as maximally informative: it makes the question less answerable.
  const maxIdf = idf(1, total);
  const termIdf = new Map<string, number>();
  for (const term of queryTerms) termIdf.set(term, docFreq.has(term) ? idf(docFreq.get(term)!, total) : maxIdf);

  const scored: Array<{ i: number; score: number }> = [];
  for (let i = 0; i < passages.length; i += 1) {
    const passage = passages[i];
    // A question about one market never gets the other market's passages (rupees and dirhams are never mixed).
    if (market !== "both" && passage.market !== "both" && passage.market !== market) continue;
    const tf = termFreqs[i];
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term);
      if (!f) continue;
      score += (termIdf.get(term) ?? 0) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * lengths[i]) / avgLength)));
    }
    if (score > 0) scored.push({ i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k);

  const best = top[0];
  let coverage = 0;
  let matchedTerms = 0;
  if (best) {
    const tf = termFreqs[best.i];
    let matched = 0;
    let all = 0;
    for (const term of queryTerms) {
      const weight = termIdf.get(term) ?? 0;
      all += weight;
      if (tf.has(term)) {
        matched += weight;
        matchedTerms += 1;
      }
    }
    coverage = all > 0 ? matched / all : 0;
  }
  // Words our content has never used at all ("France", "poem") are a warning sign. A single weak match on a common word must
  // not be enough to answer a question that is mostly about something we know nothing about.
  const unknownTerms = queryTerms.filter((term) => !docFreq.has(term)).length;
  const mostlyUnknown = unknownTerms > 0 && matchedTerms <= unknownTerms;

  return {
    passages: top.map(({ i, score }) => ({ ...passages[i], score })),
    market,
    coverage,
    answerable: top.length > 0 && coverage >= MIN_COVERAGE && !mostlyUnknown,
  };
}

/** For tests: how many passages the knowledge base holds. */
export function corpusSize(): number {
  return getIndex().passages.length;
}
