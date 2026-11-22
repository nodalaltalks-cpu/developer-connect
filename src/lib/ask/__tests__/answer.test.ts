import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAnswer, type RawTextBlock } from "../answer.ts";
import { retrieve } from "../retrieve.ts";

const passages = retrieve("How do I check a project on MahaRERA before paying?", { k: 4 }).passages;

test("each cited sentence gets a numbered marker and the exact quoted words are kept", () => {
  const blocks: RawTextBlock[] = [
    { type: "text", text: "Search the project's registration number on MahaRERA. ", citations: [{ type: "char_location", document_index: 0, cited_text: "Search the project's MahaRERA registration number." }] },
    { type: "text", text: "Confirm the promoter named is the developer you are dealing with.", citations: [{ type: "char_location", document_index: 1, cited_text: "confirm the promoter named there" }, { type: "char_location", document_index: 0, cited_text: "x" }] },
  ];
  const result = formatAnswer(blocks, passages);
  assert.equal(result.notCovered, false);
  assert.equal(result.uncited, false);
  assert.equal(result.text, "Search the project's registration number on MahaRERA. [1] Confirm the promoter named is the developer you are dealing with. [2][1]");
  assert.deepEqual(result.sources.map((s) => s.n), [1, 2]);
  assert.equal(result.sources[0].url, passages[0].url);
  assert.equal(result.sources[0].quote, "Search the project's MahaRERA registration number.");
});

test("NOT_COVERED means the sources do not answer the question", () => {
  const result = formatAnswer([{ type: "text", text: "NOT_COVERED" }], passages);
  assert.equal(result.notCovered, true);
  assert.equal(result.text, "");
});

test("an answer with no citation at all is flagged, so it is never shown as a sourced answer", () => {
  const result = formatAnswer([{ type: "text", text: "Probably around ten percent." }], passages);
  assert.equal(result.uncited, true);
  assert.equal(result.sources.length, 0);
});

test("a citation to a document that was never sent is ignored", () => {
  const result = formatAnswer([{ type: "text", text: "Fabricated.", citations: [{ type: "char_location", document_index: 99, cited_text: "x" }] }], passages);
  assert.equal(result.uncited, true);
  assert.equal(result.text, "Fabricated.");
});

test("thinking and other non-text blocks are ignored, and long quotes are shortened", () => {
  const long = "word ".repeat(200);
  const result = formatAnswer(
    [
      { type: "thinking" },
      { type: "text", text: "Answer.", citations: [{ type: "char_location", document_index: 0, cited_text: long }] },
    ],
    passages,
  );
  assert.equal(result.sources.length, 1);
  assert.ok(result.sources[0].quote.length <= 260);
  assert.ok(result.sources[0].quote.endsWith("…"));
});
