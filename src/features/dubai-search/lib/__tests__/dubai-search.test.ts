import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_LISTINGS, DEMO_UNIT_TRUTH, DEMO_LABEL, DEMO_REFERENCE_TIME } from "../demo-data.ts";
import { classifyPair, groupListings } from "../duplicates.ts";
import { filterListings, sortGroups } from "../search.ts";
import { trustIndicators } from "../trust.ts";
import { buildUserListing, parseCsv, parseListingsCsv, safeHttpUrl, CSV_EXAMPLE, MAX_CSV_ROWS } from "../csv.ts";
import { addSearch, describeFilters, filtersKey, pushRecent, toggle } from "../storage.ts";
import { summariseEvents } from "../analytics.ts";
import { dubaiSearchEnabled } from "../../flag.ts";
import { DEFAULT_FILTERS, type Listing, type SearchFilters } from "../types.ts";

const base: Listing = {
  id: "a", source: "sample-portal-a", title: "2 bed", community: "Jumeirah Village Circle", building: "Tower X", unit: "1204", floor: 12, purpose: "buy",
  propertyType: "apartment", bedrooms: 2, bathrooms: 2, areaSqft: 1100, priceAed: 1_300_000, completion: "ready", furnished: null, url: "https://example.invalid/a",
  permitNumber: null, discoveredAt: DEMO_REFERENCE_TIME, lastCheckedAt: DEMO_REFERENCE_TIME, availabilityNote: null, isDemo: true,
};
const other = (patch: Partial<Listing>): Listing => ({ ...base, id: "b", source: "sample-portal-b", ...patch });
const filters = (patch: Partial<SearchFilters> = {}): SearchFilters => ({ ...DEFAULT_FILTERS, ...patch });

test("demo data is clearly labelled, deterministic and never points at a real website", () => {
  assert.match(DEMO_LABEL, /DEMO DATA/);
  assert.ok(DEMO_LISTINGS.length >= 60);
  assert.ok(DEMO_LISTINGS.every((l) => l.isDemo && l.url.startsWith("https://example.invalid/")));
  assert.equal(new Set(DEMO_LISTINGS.map((l) => l.id)).size, DEMO_LISTINGS.length);
});

test("search: the pilot (JVC, ready apartments for sale) finds results, and each filter narrows them", () => {
  const all = filterListings(DEMO_LISTINGS, filters());
  assert.ok(all.length > 10);
  assert.ok(all.every((l) => l.community === "Jumeirah Village Circle" && l.purpose === "buy" && l.completion === "ready"));
  assert.ok(filterListings(DEMO_LISTINGS, filters({ query: "jvc" })).length === all.length, "the short name JVC works");
  const twoBeds = filterListings(DEMO_LISTINGS, filters({ bedrooms: [2] }));
  assert.ok(twoBeds.length > 0 && twoBeds.every((l) => l.bedrooms === 2));
  const capped = filterListings(DEMO_LISTINGS, filters({ maxPrice: 1_000_000 }));
  assert.ok(capped.every((l) => l.priceAed <= 1_000_000));
  const one = filterListings(DEMO_LISTINGS, filters({ sources: ["sample-agency"] }));
  assert.ok(one.every((l) => l.source === "sample-agency"));
  assert.ok(filterListings(DEMO_LISTINGS, filters({ query: "Dubai Marina", completion: "any" })).every((l) => l.community === "Dubai Marina"));
  assert.ok(filterListings(DEMO_LISTINGS, filters({ purpose: "rent", completion: "any" })).every((l) => l.purpose === "rent"));
  assert.equal(filterListings(DEMO_LISTINGS, filters({ query: "nowhere at all" })).length, 0, "an empty result is a normal result");
  assert.ok(filterListings(DEMO_LISTINGS, filters({ bedrooms: [4], completion: "any", query: "" })).every((l) => l.bedrooms >= 4));
});

test("sorting orders groups by price, size and freshness", () => {
  const groups = groupListings(filterListings(DEMO_LISTINGS, filters()));
  const asc = sortGroups(groups, "price-asc").map((g) => g.minPrice);
  assert.deepEqual(asc, [...asc].sort((x, y) => x - y));
  const desc = sortGroups(groups, "price-desc").map((g) => g.maxPrice);
  assert.deepEqual(desc, [...desc].sort((x, y) => y - x));
  const size = sortGroups(groups, "size-desc").map((g) => Math.max(...g.members.map((m) => m.areaSqft ?? 0)));
  assert.deepEqual(size, [...size].sort((x, y) => y - x));
  assert.equal(sortGroups(groups, "relevance").length, groups.length);
});

test("duplicates: the same unit on two sites is confirmed only with a shared unit number and matching area", () => {
  assert.equal(classifyPair(base, other({ areaSqft: 1105, priceAed: 1_280_000 })).kind, "confirmed");
  assert.equal(classifyPair(base, other({ unit: "1305", floor: 13 })).kind, "similar", "different unit numbers stay separate");
  assert.equal(classifyPair(base, other({ areaSqft: 1200 })).kind, "similar", "area too different");
  assert.equal(classifyPair(base, other({ building: "Tower Y" })).kind, "similar");
  assert.equal(classifyPair(base, other({ bedrooms: 3 })).kind, "similar");
  assert.equal(classifyPair(base, other({ purpose: "rent" })).kind, "similar");
  assert.equal(classifyPair(base, { ...base, id: "c" }).kind, "similar", "same source is not a cross-site duplicate");
});

test("duplicates: without a unit number a match is only probable, and only with the same known floor", () => {
  const a = { ...base, unit: null };
  assert.equal(classifyPair(a, other({ unit: null, areaSqft: 1102 })).kind, "probable");
  assert.equal(classifyPair(a, other({ unit: null, floor: null })).kind, "similar", "no floor: stacked flats share an area, so area alone proves nothing");
  assert.equal(classifyPair(a, other({ unit: null, floor: 7 })).kind, "similar");
  assert.equal(classifyPair(a, other({ unit: null, priceAed: 2_000_000 })).kind, "similar", "prices too far apart");
  assert.equal(classifyPair({ ...a, areaSqft: null }, other({ unit: null })).kind, "similar");
});

test("duplicates: a group needs every pair to agree, and never merges on a chain of maybes", () => {
  const a = { ...base, id: "a1", unit: null, areaSqft: 1100 };
  const b = other({ id: "b1", unit: null, areaSqft: 1120 });
  const c = { ...base, id: "c1", source: "sample-portal-c" as const, unit: null, areaSqft: 1140 };
  // a~b within 3%, b~c within 3%, but a~c is 3.6% apart, so c must not join a's group.
  const groups = groupListings([a, b, c]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.members.length <= 2));
  assert.ok(groups.find((g) => g.members.length === 2)?.kind === "probable");
});

test("duplicates: over the whole demo set, a confirmed group never mixes two different units and probable errors are rare", () => {
  const groups = groupListings(filterListings(DEMO_LISTINGS, filters({ completion: "any", query: "", propertyTypes: [], purpose: "buy" })));
  const rentGroups = groupListings(filterListings(DEMO_LISTINGS, filters({ completion: "any", query: "", propertyTypes: [], purpose: "rent" })));
  let probable = 0;
  let probableWrong = 0;
  let multi = 0;
  for (const g of [...groups, ...rentGroups]) {
    const units = new Set(g.members.map((m) => DEMO_UNIT_TRUTH[m.id]));
    if (g.kind === "confirmed") assert.equal(units.size, 1, `confirmed group ${g.id} mixes units`);
    if (g.kind === "probable") {
      probable++;
      if (units.size > 1) probableWrong++;
    }
    if (g.members.length > 1) multi++;
    assert.ok(g.members.length <= 4);
  }
  assert.ok(multi > 5, "the demo contains real duplicates to find");
  assert.ok(probableWrong <= Math.ceil(probable * 0.2), `probable groups wrong: ${probableWrong}/${probable}`);
});

test("trust: never says verified, always says what was and was not checked, and shows the permit as the advertiser's claim", () => {
  const indicators = trustIndicators({ ...base, permitNumber: "DEMO-123456" }, new Date(DEMO_REFERENCE_TIME));
  const text = indicators.map((i) => `${i.label} ${i.explain}`).join(" ");
  assert.doesNotMatch(indicators.map((i) => i.label).join(" "), /\bverified\b/i);
  assert.match(text, /not checked/i);
  assert.match(text, /does not guarantee/i);
  assert.match(text, /demonstration data/i);
  assert.equal(indicators.find((i) => i.key === "madmoun")?.state, "unknown");
  assert.match(indicators.find((i) => i.key === "freshness")!.explain, /does not confirm/);
  assert.match(trustIndicators(base, new Date(DEMO_REFERENCE_TIME)).find((i) => i.key === "permit")!.label, /No permit/);
});

test("csv: reads a file, quoted commas, and rejects bad rows with a reason instead of guessing", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2\n'), [["a", "b"], ["x, y", "2"]]);
  const ok = parseListingsCsv(CSV_EXAMPLE, "2026-11-20T00:00:00.000Z");
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.listings.length, 1);
  assert.equal(ok.listings[0].source, "user-csv");
  assert.equal(ok.listings[0].isDemo, false);
  assert.equal(ok.listings[0].priceAed, 1_350_000);
  assert.equal(ok.listings[0].sourceLabel, "Example Agency");

  const missing = parseListingsCsv("title,community\nx,y\n", "2026-11-20T00:00:00.000Z");
  assert.match(missing.errors[0], /Missing columns/);
  const bad = parseListingsCsv(CSV_EXAMPLE.replace("https://example.com/listing/123", "javascript:alert(1)"), "2026-11-20T00:00:00.000Z");
  assert.equal(bad.listings.length, 0);
  assert.match(bad.errors[0], /Row 2/);
  const big = parseListingsCsv(CSV_EXAMPLE.split("\n")[0] + "\n" + CSV_EXAMPLE.split("\n")[1].repeat(0) + "x".repeat(300_000), "2026-11-20T00:00:00.000Z");
  assert.match(big.errors[0], /too large/);
  assert.ok(MAX_CSV_ROWS >= 100);
});

test("a link you add: only http(s) is accepted, the page is never fetched, and text is cleaned", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,x"), null);
  assert.ok(safeHttpUrl("https://example.com/a"));
  const input = { url: "https://www.example.com/p/9", title: "Nice <b>flat</b>\u0007", community: "JVC", building: "", unit: "", floor: "", purpose: "buy", propertyType: "apartment", bedrooms: "studio", bathrooms: "", areaSqft: "", priceAed: "750,000", completion: "", furnished: "", permitNumber: "" };
  const built = buildUserListing(input, "user-url", undefined, "1", "2026-11-20T00:00:00.000Z");
  assert.ok(built.ok);
  if (built.ok) {
    assert.equal(built.listing.bedrooms, 0);
    assert.equal(built.listing.priceAed, 750_000);
    assert.equal(built.listing.sourceLabel, "example.com");
    assert.doesNotMatch(built.listing.title, /[\u0000-\u001f]/);
  }
  assert.equal(buildUserListing({ ...input, priceAed: "free" }, "user-url", undefined, "2", "2026-11-20T00:00:00.000Z").ok, false);
});

test("saving: toggles, recents and saved searches keep their limits and do not repeat", () => {
  assert.deepEqual(toggle(["a"], "b", 5), ["b", "a"]);
  assert.deepEqual(toggle(["b", "a"], "b", 5), ["a"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "b", 3), ["b", "a", "c"]);
  assert.equal(pushRecent(["a", "b", "c"], "d", 3).length, 3);
  const once = addSearch([], filters(), "2026-11-20T00:00:00.000Z", 20);
  assert.equal(addSearch(once, filters(), "2026-11-21T00:00:00.000Z", 20).length, 1, "the same search is not saved twice");
  assert.equal(addSearch(once, filters({ bedrooms: [1] }), "2026-11-21T00:00:00.000Z", 20).length, 2);
  assert.notEqual(filtersKey(filters()), filtersKey(filters({ maxPrice: 1 })));
  assert.match(describeFilters(filters({ bedrooms: [0, 2], maxPrice: 1_500_000 })), /Studio, 2 bed/);
});

test("local analytics summary counts events and distinct visit days", () => {
  const s = summariseEvents([
    { name: "visit", at: "2026-11-20T01:00:00Z" },
    { name: "visit", at: "2026-11-20T09:00:00Z" },
    { name: "visit", at: "2026-11-21T09:00:00Z" },
    { name: "search_submit", at: "2026-11-21T09:01:00Z" },
  ]);
  assert.equal(s.visits, 3);
  assert.equal(s.returningDays, 2);
  assert.equal(s.counts.search_submit, 1);
});

test("the section is on by default and only the explicit value false switches it off", () => {
  assert.equal(dubaiSearchEnabled({}), true);
  assert.equal(dubaiSearchEnabled({ DUBAI_SEARCH_ENABLED: "true" }), true);
  assert.equal(dubaiSearchEnabled({ DUBAI_SEARCH_ENABLED: "1" }), true);
  assert.equal(dubaiSearchEnabled({ DUBAI_SEARCH_ENABLED: "false" }), false);
});
