import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchBasics } from "../search-basics.tsx";
import { COMMUNITIES, getCommunity } from "../../lib/communities.ts";
import { agentQuestions, compareDetails } from "../../lib/content.ts";
import type { Kind, Purpose } from "../../lib/portals.ts";

/** Run with `node --import tsx --test` (the component is TSX). */
test("the basics panel shows the search, the area, what to compare and what to ask, and states no prices or averages", () => {
  const html = renderToStaticMarkup(<SearchBasics community={getCommunity("jumeirah-village-circle")!} purpose="buy" kind="apartments" bedrooms={2} />);
  assert.match(html, /Basic details for your search/);
  assert.match(html, /2 bedroom apartments for sale/);
  assert.match(html, /Jumeirah Village Circle \(JVC\)/);
  assert.match(html, /Total in AED/);
  assert.match(html, /Compare these details on every website/);
  assert.match(html, /Service charge/);
  assert.match(html, /Advertising permit number/);
  assert.match(html, /Ask the agent/);
  assert.match(html, /We show no prices or averages here/);
  assert.doesNotMatch(html, /average (price|rent)\s*(is|of)|AED\s?\d|\d+\s?%/i);
});

test("rent searches ask about cheques and deposit, yearly quoting is stated, and villas drop the floor row", () => {
  const rent = renderToStaticMarkup(<SearchBasics community={getCommunity("dubai-marina")!} purpose="rent" kind="apartments" bedrooms={0} />);
  assert.match(rent, /Per year in AED/);
  assert.match(rent, /Cheques, deposit and fees/);
  assert.match(rent, /Studio/);
  assert.doesNotMatch(rent, /Service charge/);
  const villa = renderToStaticMarkup(<SearchBasics community={getCommunity("palm-jumeirah")!} purpose="buy" kind="villas" bedrooms={null} />);
  assert.doesNotMatch(villa, /Floor, unit and view/);
  assert.match(villa, /plot size/);
});

test("every purpose and type has details and agent questions, none claiming a figure, a ranking or a guarantee", () => {
  for (const purpose of ["buy", "rent"] as Purpose[]) {
    for (const kind of ["apartments", "villas", "townhouses"] as Kind[]) {
      const text = [...compareDetails({ purpose, kind, bedrooms: null }).flatMap((r) => [r.label, r.why]), ...agentQuestions({ purpose })].join(" ");
      assert.ok(compareDetails({ purpose, kind, bedrooms: null }).length >= 8);
      assert.ok(agentQuestions({ purpose }).length >= 4);
      assert.doesNotMatch(text, /\bAED\s?\d|\d+\s?%|best|guarantee|safest|will rise/i);
    }
  }
  assert.ok(COMMUNITIES.length > 100);
});
