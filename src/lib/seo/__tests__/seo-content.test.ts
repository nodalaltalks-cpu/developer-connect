import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES, getGuide, guideForArea, guidePath } from "../guides.ts";
import { emiFor, loanForEmi } from "../emi.ts";
import { GLOSSARY } from "../tools.ts";
import { CONSULTANT_PAGES, consultantPath } from "../consultant-pages.ts";
import { guideToMarkdown, consultantToMarkdown } from "../markdown.ts";
import { resolveLocationPage } from "../../developer-connect/location-pages.ts";
import { COMMISSION_POLICY } from "../../leads/gate/gate-copy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const allText = () =>
  [
    ...GUIDES.map((g) => guideToMarkdown(g)),
    ...CONSULTANT_PAGES.map((p) => consultantToMarkdown(p)),
    ...GUIDES.map((g) => g.metaTitle + " " + g.description),
    ...CONSULTANT_PAGES.map((p) => p.metaTitle + " " + p.description),
  ].join("\n");

test("guides: unique slugs, every related guide exists, nothing orphaned", () => {
  const slugs = GUIDES.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const r of g.related) assert.ok(getGuide(r), `${g.slug} relates to missing ${r}`);
    assert.ok(!g.related.includes(g.slug), `${g.slug} relates to itself`);
  }
  const linked = new Set(GUIDES.flatMap((g) => g.related).concat(CONSULTANT_PAGES.flatMap((p) => [...p.guides])));
  for (const g of GUIDES) assert.ok(linked.has(g.slug), `${g.slug} is not linked from any other page`);
});

test("guides: titles and descriptions fit a search result, and each page answers first and has FAQ", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const g of GUIDES) {
    assert.ok(g.metaTitle.length <= 60, `${g.slug} title too long (the brand suffix may be cut, the topic must not be)`);
    assert.ok(g.description.length >= 110 && g.description.length <= 165, `${g.slug} description is ${g.description.length} characters`);
    assert.ok(g.summary.length > 80, `${g.slug} has no summary`);
    assert.ok(g.faq.length >= 2, `${g.slug} needs FAQ`);
    assert.ok(g.blocks.filter((b) => b.t === "h2").length >= 3, `${g.slug} needs real sections`);
    assert.ok(!titles.has(g.metaTitle) && !descriptions.has(g.description), `${g.slug} duplicates another page`);
    titles.add(g.metaTitle);
    descriptions.add(g.description);
    assert.match(g.updated, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("consultant pages: one per city, unique, each pointing at a real directory view and real guides", () => {
  assert.ok(CONSULTANT_PAGES.length >= 4);
  assert.equal(new Set(CONSULTANT_PAGES.map((p) => p.slug)).size, CONSULTANT_PAGES.length);
  for (const p of CONSULTANT_PAGES) {
    assert.ok(resolveLocationPage(p.directory.country, p.directory.city), `${p.slug} directory view is not an approved location`);
    for (const g of p.guides) assert.ok(getGuide(g), `${p.slug} links to missing guide ${g}`);
    assert.ok(p.description.length >= 110 && p.description.length <= 200, `${p.slug} description length ${p.description.length}`);
    assert.ok(p.areaGroups.flatMap((a) => a.areas).length >= 8);
    assert.ok(consultantPath(p).startsWith("/property-consultant/"));
  }
});

test("copy rules: no broker, independence, ranking, rating or verification claims in SEO content", () => {
  const text = allText();
  for (const banned of [/\bbroker/i, /brokerage/i, /\bindependent\b/i, /(?<!#)#\s?1\b/, /\bbest (developer|consultant|property)/i, /top[- ]rated/i, /\bverified developer/i, /\b5[- ]star/i, /\btop \d+ /i, /\brated\b/i, /\b[0-9]+ reviews\b/i]) {
    assert.ok(!banned.test(text), `SEO content must not contain ${banned}`);
  }
});

test("fees: stated only in the disclaimer and legal pages (linked from the footer), never on the home page or the city landing pages", () => {
  assert.ok(COMMISSION_POLICY.startsWith("Developer Connects charges 0% commission on primary (new-launch) sales."));
  assert.match(read("src/app/disclaimer/page.tsx"), /COMMISSION_POLICY/);
  assert.match(read("src/components/site-footer.tsx"), /href: "\/disclaimer"/);
  const home = read("src/app/(marketing)/page.tsx");
  assert.ok(!/FeeTransparency|commission|0%/i.test(home), "no fees on the home page");
  for (const file of ["src/app/property-consultant/[slug]/page.tsx", "src/app/property-consultant/page.tsx", "src/lib/seo/consultant-pages.ts"]) {
    assert.ok(!/COMMISSION_POLICY|commission|0%/i.test(read(file)), `${file} must not state fees`);
  }
  // No guide, city page or AI-readable file carries the policy sentence: it lives on the Disclaimer and FAQ pages only.
  assert.ok(!allText().includes("0% commission"), "SEO content must not state Developer Connects' fees");
  for (const file of ["src/app/llms.txt/route.ts", "src/app/llms-full.txt/route.ts", "src/app/privacy/page.tsx", "src/app/about/page.tsx", "src/components/site-footer.tsx"]) {
    assert.ok(!/0% commission|COMMISSION_POLICY|CREDENTIALS_LINE|channel partner/.test(read(file)), `${file} must not state fees or credentials`);
  }
});

test("facts that change are never stated as exact current rates", () => {
  const text = allText();
  // Specific percentage rates for stamp duty or GST must not be hard-coded: the guides tell the reader to check the current rate.
  assert.ok(!/stamp duty (is|of) \d/i.test(text));
  assert.ok(!/GST (is|of|at) \d/i.test(text));
});

test("crawl surface: sitemap lists guides and city pages; robots welcomes AI crawlers; llms files exist; footer and home link in", () => {
  const sitemap = read("src/lib/sitemap-entries.ts");
  assert.match(sitemap, /GUIDES\.map/);
  assert.match(sitemap, /CONSULTANT_PAGES\.map/);
  assert.match(sitemap, /"\/guides"/);
  assert.match(sitemap, /"\/property-consultant"/);
  const robots = read("src/app/robots.ts");
  for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Google-Extended"]) assert.match(robots, new RegExp(bot));
  assert.match(read("src/app/llms.txt/route.ts"), /llms-full\.txt/);
  assert.match(read("src/app/llms-full.txt/route.ts"), /guideToMarkdown/);
  assert.match(read("src/components/site-footer.tsx"), /\/guides/);
  assert.match(read("src/app/(marketing)/page.tsx"), /GuidesStrip/);
});

test("structured data: one organisation entity site-wide, article and FAQ markup on every guide, breadcrumbs everywhere", () => {
  assert.match(read("src/app/layout.tsx"), /organizationSchema\(\)/);
  const guidePage = read("src/app/guides/[slug]/page.tsx");
  for (const piece of ["articleSchema", "faqSchema", "breadcrumbSchema", "alternates: { canonical"]) assert.ok(guidePage.includes(piece), piece);
  const cityPage = read("src/app/property-consultant/[slug]/page.tsx");
  for (const piece of ['"Service"', "faqSchema", "breadcrumbSchema", "alternates: { canonical"]) assert.ok(cityPage.includes(piece), piece);
  const schema = read("src/lib/seo/schema.ts");
  assert.ok(!/aggregateRating|reviewCount|ratingValue|streetAddress/.test(schema), "no rating or address is invented");
  assert.ok(guidePath(GUIDES[0]).startsWith("/guides/"));
});

test("navi mumbai: an indexed landing page linked from the Mumbai page, never a card in the consultant hub or the footer", () => {
  const navi = CONSULTANT_PAGES.find((p) => p.slug === "navi-mumbai");
  assert.ok(navi && navi.inHub === false);
  const mumbai = CONSULTANT_PAGES.find((p) => p.slug === "mumbai");
  assert.equal(mumbai?.alsoServing?.slug, "navi-mumbai");
  assert.match(read("src/app/property-consultant/page.tsx"), /inHub !== false/);
  assert.ok(!/navi-mumbai/i.test(read("src/components/site-footer.tsx")));
  assert.match(read("src/lib/sitemap-entries.ts"), /CONSULTANT_PAGES\.map/);
});

test("neighbourhood guides: each names an area a city page covers, so the area chip links to it; no prices, rents or yields quoted", () => {
  const areaGuides = GUIDES.filter((g) => g.area);
  assert.ok(areaGuides.length >= 8);
  const covered = new Set(CONSULTANT_PAGES.flatMap((p) => p.areaGroups.flatMap((a) => [...a.areas])));
  for (const g of areaGuides) {
    assert.ok(covered.has(g.area as string), `${g.slug}: "${g.area}" is not in any city page's areas`);
    assert.equal(guideForArea(g.area as string)?.slug, g.slug);
    const text = guideToMarkdown(g);
    assert.ok(!/(₹|Rs\.?|INR|AED)\s?\d|\d+(\.\d+)?\s?%|per cent|percent|yield of|crore|lakh/i.test(text), `${g.slug} quotes a figure that changes`);
  }
  assert.match(read("src/app/property-consultant/[slug]/page.tsx"), /guideForArea\(area\)/);
});

test("tools: EMI maths is the standard reducing-balance formula, and the tools and glossary are crawlable", () => {
  const { emi, totalInterest } = emiFor(1_000_000, 12, 1);
  assert.ok(Math.abs(emi - 88848.79) < 0.01, `EMI ${emi}`);
  assert.ok(Math.abs(totalInterest - (emi * 12 - 1_000_000)) < 0.001);
  assert.equal(emiFor(120_000, 0, 1).emi, 10_000);
  assert.ok(Math.abs(loanForEmi(emi, 12, 1) - 1_000_000) < 0.01, "affordability is the exact inverse");
  assert.deepEqual(emiFor(0, 8, 20), { emi: 0, totalInterest: 0, totalPayable: 0 });
  assert.equal(new Set(GLOSSARY.map((t) => t.id)).size, GLOSSARY.length);
  const sitemap = read("src/lib/sitemap-entries.ts");
  for (const path of ["/tools/home-loan-emi-calculator", "/property-glossary"]) {
    assert.ok(sitemap.includes(`"${path}"`), `${path} in sitemap`);
    assert.ok(read("src/components/site-footer.tsx").includes(path), `${path} in footer`);
  }
  assert.match(read("src/app/property-glossary/page.tsx"), /DefinedTermSet/);
  assert.match(read("src/app/tools/home-loan-emi-calculator/page.tsx"), /WebApplication/);
});

test("official sources: every guide links only to the approved regulator sites, and the Article schema cites them", async () => {
  const { officialSourcesFor, MAHARERA, DUBAI_LAND_DEPARTMENT } = await import("../sources.ts");
  const { articleSchema } = await import("../schema.ts");
  const approved = new Set([MAHARERA.url, DUBAI_LAND_DEPARTMENT.url]);
  for (const g of GUIDES) {
    const sources = officialSourcesFor(g.market);
    assert.ok(sources.length >= 1, `${g.slug} has no official source`);
    for (const s of sources) assert.ok(approved.has(s.url) && s.url.startsWith("https://"), `${g.slug}: unapproved ${s.url}`);
    assert.deepEqual(articleSchema(g).citation, sources.map((s) => s.url));
  }
  assert.deepEqual(officialSourcesFor("mumbai").map((s) => s.url), [MAHARERA.url]);
  assert.deepEqual(officialSourcesFor("dubai").map((s) => s.url), [DUBAI_LAND_DEPARTMENT.url]);
});
