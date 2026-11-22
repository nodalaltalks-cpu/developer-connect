import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMUNITIES, getCommunity } from "../communities.ts";
import { allPages, intentLabel, intentsFor, isIndexable, pagePath, pageTitle, parseIntent, resolve, sitemapPaths } from "../intents.ts";
import { bayutUrl, portalLinks, propertyFinderUrl } from "../portals.ts";
import { checklistFor, faqFor, introFor } from "../content.ts";
import { HUB_FAQ, COMPARE_FAQ } from "../hub.ts";

const jvc = getCommunity("jumeirah-village-circle")!;
const marina = getCommunity("dubai-marina")!;
const palm = getCommunity("palm-jumeirah")!;
const hills = getCommunity("dubai-hills-estate")!;
const jlt = getCommunity("jumeirah-lake-towers")!;

test("portal links match the real address patterns verified on Bayut and Property Finder", () => {
  assert.equal(bayutUrl({ community: jvc, purpose: "buy", kind: "apartments", bedrooms: 2 }), "https://www.bayut.com/for-sale/2-bedroom-apartments/dubai/jumeirah-village-circle-jvc/");
  assert.equal(propertyFinderUrl({ community: jvc, purpose: "buy", kind: "apartments", bedrooms: 2 }), "https://www.propertyfinder.ae/en/buy/dubai/2-bedroom-apartments-for-sale-jumeirah-village-circle.html");
  assert.equal(bayutUrl({ community: marina, purpose: "rent", kind: "apartments", bedrooms: 0 }), "https://www.bayut.com/to-rent/studio-apartments/dubai/dubai-marina/");
  assert.equal(propertyFinderUrl({ community: marina, purpose: "rent", kind: "apartments", bedrooms: 0 }), "https://www.propertyfinder.ae/en/rent/dubai/studio-apartments-for-rent-dubai-marina.html");
  assert.equal(bayutUrl({ community: palm, purpose: "buy", kind: "villas", bedrooms: null }), "https://www.bayut.com/for-sale/villas/dubai/palm-jumeirah/");
  assert.equal(propertyFinderUrl({ community: hills, purpose: "rent", kind: "villas", bedrooms: null }), "https://www.propertyfinder.ae/en/rent/dubai/villas-for-rent-dubai-hills-estate.html");
  // The two portals spell JLT differently; both spellings were checked.
  assert.match(bayutUrl({ community: jlt, purpose: "buy", kind: "apartments", bedrooms: null }), /jumeirah-lake-towers-jlt\/$/);
  assert.match(propertyFinderUrl({ community: jlt, purpose: "buy", kind: "apartments", bedrooms: null }), /apartments-for-sale-jumeirah-lake-towers\.html$/);
});

test("villas and townhouses never get a bedroom segment, and every link is https on the portal's own domain", () => {
  const links = portalLinks({ community: hills, purpose: "buy", kind: "villas", bedrooms: 3 });
  assert.ok(links.every((l) => !/bedroom/.test(l.url)));
  const dz = links.find((l) => l.id === "dubizzle")!;
  assert.equal(dz.url, "https://dubai.dubizzle.com/property-for-sale/", "villas do not open the apartments page");
  assert.match(portalLinks({ community: jvc, purpose: "rent", kind: "apartments", bedrooms: 1 }).find((l) => l.id === "dubizzle")!.url, /property-for-rent\/residential\/apartmentflat\/$/);
  for (const c of COMMUNITIES) {
    for (const i of intentsFor(c)) {
      for (const l of portalLinks({ community: c, purpose: i.purpose, kind: i.kind, bedrooms: i.bedrooms })) {
        const url = new URL(l.url);
        assert.equal(url.protocol, "https:");
        assert.ok(["www.bayut.com", "www.propertyfinder.ae", "dubai.dubizzle.com"].includes(url.hostname), `${l.url} host`);
      }
    }
  }
});

test("the page set: every page resolves, addresses are unique, villas and townhouses only where both portals have them", () => {
  const pages = allPages();
  assert.equal(new Set(pages.map((p) => `${p.community}/${p.intent}`)).size, pages.length);
  for (const p of pages) assert.ok(resolve(p.community, p.intent), `${p.community}/${p.intent}`);
  assert.equal(resolve("jumeirah-village-circle", "villas-for-sale"), null);
  assert.ok(resolve("palm-jumeirah", "villas-for-sale"));
  assert.equal(resolve("palm-jumeirah", "townhouses-for-rent"), null);
  assert.ok(resolve("dubai-hills-estate", "townhouses-for-sale"));
  assert.equal(resolve("nowhere", "apartments-for-sale"), null);
  assert.equal(parseIntent("4-bedroom-apartments-for-sale"), null);
  assert.equal(parseIntent("../../etc/passwd"), null);
  assert.equal(intentLabel(parseIntent("studio-apartments-for-rent")!), "Studio apartments for rent");
  assert.equal(pageTitle(jvc, parseIntent("2-bedroom-apartments-for-sale")!), "2 bedroom apartments for sale in Jumeirah Village Circle (JVC), Dubai");
});

test("sitemap: only useful pages are offered to search engines, and everything offered is a real page", () => {
  const paths = sitemapPaths();
  assert.ok(paths.includes("/dubai-property-search") && paths.includes("/dubai-property-search/compare"));
  assert.ok(paths.includes("/dubai-property-search/jumeirah-village-circle/2-bedroom-apartments-for-sale"), "top communities get bedroom pages");
  assert.ok(!paths.includes("/dubai-property-search/arjan/2-bedroom-apartments-for-sale"), "other bedroom pages stay out until they earn their place");
  assert.ok(paths.includes("/dubai-property-search/arjan/apartments-for-sale"));
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    const [, , community, intent] = path.split("/");
    if (!intent) continue;
    const r = resolve(community, intent)!;
    assert.ok(r && isIndexable(r.community, r.intent), path);
  }
  assert.ok(paths.length > 60 && paths.length < 200, `unexpected page count ${paths.length}`);
  assert.equal(pagePath("arjan"), "/dubai-property-search/arjan");
});

test("content: every page has its own introduction and its own question wording, with no invented numbers or claims", () => {
  const intros = new Set<string>();
  const questions = new Set<string>();
  let pages = 0;
  for (const c of COMMUNITIES) {
    assert.doesNotMatch(c.about, /\d|%|AED|best|guarantee|cheap|safest|investment return|yield/i, `${c.name} about`);
    for (const i of intentsFor(c)) {
      pages++;
      intros.add(introFor(c, i));
      for (const f of faqFor(c, i).slice(0, 3)) questions.add(f.question);
      const text = [introFor(c, i), ...checklistFor(i), ...faqFor(c, i).map((f) => f.answer)].join(" ");
      assert.doesNotMatch(text, /\bAED\s?\d|\d+\s?%|best (area|deal|price)|guaranteed|will rise|will go up|safest/i, `${c.id}/${i.slug}`);
      assert.doesNotMatch(text, /\bverified\b/i);
    }
  }
  assert.equal(intros.size, pages, "no two pages share an introduction");
  assert.equal(questions.size, pages * 3, "the lead questions are never repeated across pages");
});

test("content: the checklist always tells the buyer the permit is not proof, and rent pages mention yearly quoting", () => {
  assert.match(checklistFor(parseIntent("apartments-for-sale")!).join(" "), /does not prove/);
  assert.match(introFor(marina, parseIntent("apartments-for-rent")!), /per year/);
  assert.doesNotMatch(introFor(marina, parseIntent("apartments-for-sale")!), /per year/);
});

test("hub and comparison FAQs state independence from the portals and that nothing is copied", () => {
  const text = [...HUB_FAQ, ...COMPARE_FAQ].map((f) => f.answer).join(" ");
  assert.match(text, /not affiliated/i);
  assert.match(text, /do not copy|never open or copy/i);
  assert.match(text, /earn nothing/i);
});
