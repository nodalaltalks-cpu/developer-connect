import { NOT_COVERED } from "./prompt.ts";
import type { RetrievedPassage } from "./retrieve.ts";

/**
 * Turns the model's reply into what the buyer sees: the text with numbered markers, and a list of the exact passages each marker
 * points to, with the quoted words. The citations come from the API (it checks the quoted words exist in the document), so a marker
 * is a fact about the source, not the model's claim.
 */

export interface RawCitation {
  type: string;
  cited_text?: string;
  document_index?: number;
}

export interface RawTextBlock {
  type: string;
  text?: string;
  citations?: RawCitation[] | null;
}

export interface AnswerSource {
  n: number;
  title: string;
  url: string;
  quote: string;
  updated?: string;
}

export interface FormattedAnswer {
  text: string;
  sources: AnswerSource[];
  /** The model said the sources do not answer the question. */
  notCovered: boolean;
  /** True when no sentence is tied to a source: the caller must not show it as an answer. */
  uncited: boolean;
}

const QUOTE_MAX = 260;

function tidyQuote(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1)}…` : flat;
}

export function formatAnswer(blocks: RawTextBlock[], passages: RetrievedPassage[]): FormattedAnswer {
  const textBlocks = blocks.filter((b) => b.type === "text" && typeof b.text === "string");
  const joined = textBlocks.map((b) => b.text).join("").trim();
  if (joined === NOT_COVERED || joined.startsWith(NOT_COVERED)) return { text: "", sources: [], notCovered: true, uncited: false };

  const numbers = new Map<number, number>(); // document index -> marker number
  const sources: AnswerSource[] = [];
  let out = "";

  for (const block of textBlocks) {
    let piece = block.text ?? "";
    const markers: number[] = [];
    for (const citation of block.citations ?? []) {
      if (typeof citation.document_index !== "number") continue;
      const passage = passages[citation.document_index];
      if (!passage) continue; // a citation to a document we did not send is ignored
      let n = numbers.get(citation.document_index);
      if (n === undefined) {
        n = sources.length + 1;
        numbers.set(citation.document_index, n);
        sources.push({ n, title: passage.title, url: passage.url, quote: tidyQuote(citation.cited_text ?? passage.text), ...(passage.updated ? { updated: passage.updated } : {}) });
      }
      if (!markers.includes(n)) markers.push(n);
    }
    if (markers.length > 0) {
      const trailing = piece.match(/\s*$/)?.[0] ?? "";
      piece = `${piece.slice(0, piece.length - trailing.length)} ${markers.map((n) => `[${n}]`).join("")}${trailing}`;
    }
    out += piece;
  }

  return { text: out.trim(), sources, notCovered: false, uncited: sources.length === 0 };
}
