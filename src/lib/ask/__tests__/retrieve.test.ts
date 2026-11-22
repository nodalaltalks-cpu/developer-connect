import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusSize, detectMarket, retrieve, tokenize } from "../retrieve.ts";
import { ANSWERABLE, MUST_DECLINE } from "../eval-set.ts";

test("the knowledge base is built from the site's own content", () => {
  assert.ok(corpusSize() > 200, `only ${corpusSize()} passages`);
});

test("tokenizing drops filler words, unifies plurals and same-meaning words", () => {
  assert.deepEqual(tokenize("How do I check the flats?"), ["check", "flat"]);
  assert.deepEqual(tokenize("builders and developers"), ["developer", "developer"]);
});

test("a question names its market, or none", () => {
  assert.equal(detectMarket("Stamp duty for a flat in Mumbai"), "india");
  assert.equal(detectMarket("Off-plan escrow in Dubai"), "dubai");
  assert.equal(detectMarket("How does a home loan work?"), "both");
  assert.equal(detectMarket("Compare Mumbai and Dubai"), "both");
});

test("a Dubai question never gets India's passages, and an India question never gets Dubai's", () => {
  const dubai = retrieve("how does the payment plan work", { market: "dubai", k: 10 });
  assert.ok(dubai.passages.every((p) => p.market !== "india"));
  const india = retrieve("how does the payment plan work", { market: "india", k: 10 });
  assert.ok(india.passages.every((p) => p.market !== "dubai"));
});

for (const c of ANSWERABLE) {
  test(`finds its source: ${c.q}`, () => {
    const result = retrieve(c.q, { market: c.market, k: 8 });
    assert.equal(result.answerable, true, `not answerable (coverage ${result.coverage.toFixed(2)})`);
    const haystack = result.passages.map((p) => `${p.id} ${p.url}`).join("\n").toLowerCase();
    assert.ok(
      c.from.some((needle) => haystack.includes(needle.toLowerCase())),
      `expected one of [${c.from.join(", ")}] in:\n${result.passages.map((p) => `${p.id} (${p.score.toFixed(1)})`).join("\n")}`,
    );
  });
}

for (const q of MUST_DECLINE) {
  test(`declines without calling the AI: ${q}`, () => {
    assert.equal(retrieve(q).answerable, false);
  });
}

test("an empty or filler-only question is not answerable", () => {
  assert.equal(retrieve("").answerable, false);
  assert.equal(retrieve("the of and").answerable, false);
});
