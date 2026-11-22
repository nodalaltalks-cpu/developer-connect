import { test } from "node:test";
import assert from "node:assert/strict";
import { groundAnswer, splitSentences } from "../grounding.ts";
import { retrieve } from "../retrieve.ts";

const passages = retrieve("How do I check a project on MahaRERA before paying?", { k: 4 }).passages;
const first = passages[0];

test("sentences are split with their markers attached, bullets and newlines handled", () => {
  assert.deepEqual(splitSentences("Check the registration. [S1] Confirm the promoter [S2]. Then pay."), [
    "Check the registration [S1].",
    "Confirm the promoter [S2].",
    "Then pay.",
  ]);
  assert.deepEqual(splitSentences("- First point [S1]\n- Second point [S2]"), ["First point [S1]", "Second point [S2]"]);
});

test("a sentence copied faithfully from its passage is kept, with a marker and the quote", () => {
  const sentence = first.text.split(/(?<=[.!?])\s+/)[0].replace(/\s+/g, " ").trim();
  const result = groundAnswer(`${sentence} [S1]`, passages);
  assert.equal(result.uncited, false);
  assert.equal(result.dropped, 0);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, first.url);
  assert.match(result.text, /\[1\]$/);
});

test("a sentence with no source label is dropped", () => {
  const result = groundAnswer("MahaRERA charges a small fee to register every project.", passages);
  assert.equal(result.uncited, true);
  assert.equal(result.dropped, 1);
});

test("a sentence citing a passage that does not support it is dropped", () => {
  const result = groundAnswer("Spaceships orbit Jupiter every winter morning [S1].", passages);
  assert.equal(result.uncited, true);
});

test("an invented number is dropped even when the words are close to the source", () => {
  const sentence = first.text.split(/(?<=[.!?])\s+/)[0].replace(/\s+/g, " ").trim();
  const result = groundAnswer(`${sentence} The fee is 9876 rupees [S1].`, passages);
  assert.ok(!result.text.includes("9876"));
});

test("a citation to a passage that was never sent is dropped", () => {
  const result = groundAnswer("Check the registration number on the website [S9].", passages);
  assert.equal(result.uncited, true);
});

test("good sentences survive while the bad ones around them are removed", () => {
  const good = first.text.split(/(?<=[.!?])\s+/)[0].replace(/\s+/g, " ").trim();
  const result = groundAnswer(`${good} [S1] Everyone should buy immediately. ${good} [S1]`, passages);
  assert.equal(result.dropped, 1);
  assert.equal(result.sources.length, 1);
  assert.equal(result.uncited, false);
});

test("NOT_COVERED is recognised", () => {
  const result = groundAnswer("NOT_COVERED", passages);
  assert.equal(result.notCovered, true);
});
