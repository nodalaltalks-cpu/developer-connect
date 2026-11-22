import { tokenize } from "./retrieve.ts";
import type { RetrievedPassage } from "./retrieve.ts";
import { NOT_COVERED } from "./prompt.ts";
import type { AnswerSource, FormattedAnswer } from "./answer.ts";

/**
 * Checks an answer from ANY model (one you run yourself, or a hosted open model) against the passages it was given, without trusting
 * the model. The model is asked to end every sentence with the label of the passage that supports it ([S1], [S2]...). Then, in
 * plain code, each sentence is kept only if:
 *   - it names a passage that really was sent,
 *   - most of its meaningful words appear in that passage, and
 *   - every number in it appears in that passage.
 * A sentence that fails is removed. So a weaker model cannot invent a fee, a date or a rule and have it shown: the worst case is a
 * shorter answer, or none (and then the visitor gets the guide passages instead).
 */

/** The share of a sentence's meaningful words that must appear in the passage(s) it cites. */
export const SUPPORT_MIN = 0.6;

const MARKER = /\[S(\d+)\]/g;
const QUOTE_MAX = 260;

function normaliseMarkers(text: string): string {
  // "...number. [S1] Next" -> "...number [S1]. Next", so a marker stays with the sentence it supports.
  return text.replace(/([.!?])\s*((?:\[S\d+\]\s*)+)/g, (_m, end: string, marks: string) => ` ${marks.trim()}${end} `);
}

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!line) continue;
    for (const sentence of normaliseMarkers(line).split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")).filter((n) => n.length > 0);
}

function bestQuote(passage: RetrievedPassage, sentence: string): string {
  const wanted = new Set(tokenize(sentence));
  const pieces = passage.text.split(/(?<=[.!?])\s+|\n/).map((p) => p.trim()).filter(Boolean);
  let best = pieces[0] ?? passage.text;
  let bestScore = -1;
  for (const piece of pieces) {
    const score = tokenize(piece).filter((t) => wanted.has(t)).length;
    if (score > bestScore) {
      best = piece;
      bestScore = score;
    }
  }
  const flat = best.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1)}…` : flat;
}

export interface GroundingReport extends FormattedAnswer {
  /** Sentences removed because they were unsupported. */
  dropped: number;
  /** Sentences the model wrote. */
  total: number;
}

export function groundAnswer(raw: string, passages: RetrievedPassage[]): GroundingReport {
  const trimmed = raw.trim();
  if (trimmed.startsWith(NOT_COVERED)) return { text: "", sources: [], notCovered: true, uncited: false, dropped: 0, total: 0 };

  const sentences = splitSentences(trimmed);
  const evidenceTokens = passages.map((p) => new Set(tokenize(`${p.title} ${p.text}`)));
  const evidenceNumbers = passages.map((p) => new Set(numbersIn(p.text)));

  const numbering = new Map<number, number>();
  const sources: AnswerSource[] = [];
  const kept: string[] = [];
  let dropped = 0;

  for (const sentence of sentences) {
    const cited = [...new Set([...sentence.matchAll(MARKER)].map((m) => Number(m[1]) - 1))].filter((i) => i >= 0 && i < passages.length);
    const clean = sentence.replace(MARKER, "").replace(/\s+/g, " ").replace(/\s+([.!?,;:])/g, "$1").trim();
    const words = tokenize(clean);
    if (cited.length === 0 || words.length === 0) {
      dropped += 1;
      continue;
    }
    const known = new Set(cited.flatMap((i) => [...evidenceTokens[i]]));
    const supported = words.filter((w) => known.has(w)).length / words.length;
    const knownNumbers = new Set(cited.flatMap((i) => [...evidenceNumbers[i]]));
    const numbersOk = numbersIn(clean).every((n) => knownNumbers.has(n));
    if (supported < SUPPORT_MIN || !numbersOk) {
      dropped += 1;
      continue;
    }
    const marks: number[] = [];
    for (const index of cited) {
      let n = numbering.get(index);
      if (n === undefined) {
        n = sources.length + 1;
        numbering.set(index, n);
        const passage = passages[index];
        sources.push({ n, title: passage.title, url: passage.url, quote: bestQuote(passage, clean), ...(passage.updated ? { updated: passage.updated } : {}) });
      }
      marks.push(n);
    }
    kept.push(`${clean} ${marks.map((n) => `[${n}]`).join("")}`);
  }

  return { text: kept.join(" "), sources, notCovered: false, uncited: kept.length === 0, dropped, total: sentences.length };
}
