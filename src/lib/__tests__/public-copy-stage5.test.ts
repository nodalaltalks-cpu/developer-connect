import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BUY_DIRECT_STEPS, buyDirectFaq } from "../developer-connect/buy-direct-guides.ts";
import { locationMetadataText, locationIntro, approvedLocationPages } from "../developer-connect/location-pages.ts";

/**
 * Stage 5 changed the public journey to: research -> connect with Developer
 * Connects -> property assistance. A buyer is never sent to a developer's
 * website, so no public copy may tell them to go there or promise a link to
 * it. These tests keep that old wording from coming back, while checking the
 * useful verification and SEO wording is still there.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../.."); // src
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const plain = (source: string) =>
  source.replace(/\{" "\}/g, " ").replace(/<[^>]+>/g, " ").replace(/&apos;|&rsquo;/g, "'").replace(/\s+/g, " ");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Every buyer-facing source: pages (not admin), public content libraries, the llms.txt route and the shared layout. */
const PUBLIC_FILES = [
  ...walk(path.join(src, "app"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/[\\/]admin[\\/]|__tests__|\.test\./.test(file))
    .map((file) => path.relative(src, file).split(path.sep).join("/")),
  "lib/developer-connect/buy-direct-guides.ts",
  "lib/developer-connect/location-pages.ts",
  "lib/developer-connect/developer-page-content.ts",
  "lib/leads/gate/gate-copy.ts",
];

/** Wording that sends a buyer to a developer's website, or promises a link to it. */
const STALE: RegExp[] = [
  /go (directly|straight) to (the )?(source|developer|each developer)/i,
  /go to the source/i,
  /straight (to|from) the source/i,
  /go straight to each developer/i,
  /(visit|go to|open|continue to) (the |a |each |its |their )?developer.?s? (verified )?(official )?website/i,
  /(visit|go to|open) (the )?(developer.s )?verified official website/i,
  /continue to a developer.s official website/i,
  /we link to developers?.? (own )?websites/i,
  /links? to the site we have verified/i,
  /linked website/i,
  /the link to it/i,
  /each listing shows the official website we have verified/i,
  /Visit official website/i,
  /Continue to official website/i,
];

test("public copy: nothing tells a buyer to go to a developer's website or promises a link to it", () => {
  const offenders: string[] = [];
  for (const file of PUBLIC_FILES) {
    const text = plain(code(read(file)));
    for (const pattern of STALE) {
      const hit = text.match(pattern);
      if (hit) offenders.push(`${file}: "${hit[0]}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("homepage: the headline and sub-line match the new journey (connect, with optional property assistance)", () => {
  const home = plain(read("app/(marketing)/page.tsx"));
  assert.match(home, /Research first\. Get expert help when you('|&apos;)re ready\./);
  assert.match(home, /Explore developers across India and the UAE, see who you are dealing with, and talk to a property specialist only when you choose to\./);
});

test("site description (default meta description): says the verification is what it is, and offers help connecting", () => {
  const layout = plain(read("app/layout.tsx"));
  assert.match(layout, /which verifies each listed developer's official website, and get expert property help when you are ready/);
});

test("buy-direct guides: still teach the useful steps (verify the developer, check the regulator, get terms in writing) without sending anyone to a website", () => {
  const titles = BUY_DIRECT_STEPS.map((step) => step.title);
  assert.equal(titles.length, 5, "the five-step structure (and its HowTo/FAQ SEO value) is unchanged");
  assert.match(titles[0], /genuine developer/i);
  assert.match(titles[1], /regulator/i);
  assert.match(titles[3], /in writing/i);
  assert.match(titles[4], /official account/i);

  const body = BUY_DIRECT_STEPS.map((step) => step.title + " " + step.body).join(" ");
  assert.match(body, /Developer Connects confirms the official website that belongs to each developer it lists/);
  assert.match(body, /our property team can help you reach them/);

  const faq = buyDirectFaq().map((item) => item.question + " " + item.answer).join(" ");
  assert.match(faq, /Developer Connects can help you connect with the developer/);
  assert.match(faq, /look-alike domains/, "the fake-website warning (useful, and SEO-relevant) is kept");
  assert.match(faq, /we have verified its official website/);
  assert.match(faq, /may receive payment from developers or others/, "the commercial disclosure stays in the guide FAQ");
});

test("location pages: the title keeps its SEO pattern; the description and intro no longer send the reader to a website", () => {
  const page = approvedLocationPages()[0];
  const text = locationMetadataText(page);
  assert.match(text.title, /Verified Official Websites \| Developer Connects/, "established SEO title pattern is unchanged");
  assert.equal(
    text.description,
    `Explore verified real estate developers in ${page.phrase}. Developer Connects has verified each developer’s official website and can help you connect with the developer.`,
    "a full sentence, with its stop after the place name",
  );
  assert.doesNotMatch(text.description, /go straight|visit|link/i);
  assert.match(locationIntro(page, 3), /with an official website verified by Developer Connects\./);
});

test("buy-direct hub and market pages: the verification message stays, the 'go to the website' call to action is gone", () => {
  const hub = plain(read("app/buy-direct-from-developer/page.tsx"));
  assert.match(hub, /Start with a verified developer/);
  assert.match(hub, /confirms the official website that belongs to each one/);
  assert.match(hub, /connect with the developer through Developer Connects and our property team will help with your enquiry/);

  const market = plain(read("app/buy-direct-from-developer/[market]/page.tsx"));
  assert.match(market, /Connect with a developer through Developer Connects and our property team will help with your enquiry\./);
});

test("FAQ and how-we-verify: describe connecting through Developer Connects, and say the website is verification data that is not published", () => {
  const faq = plain(read("app/faq/page.tsx"));
  assert.match(faq, /When you ask to connect with a developer, we ask for your WhatsApp number or phone/);
  assert.match(faq, /We verify developers' official websites and offer optional property assistance\./);
  assert.match(faq, /Developer Connects does not send you to the developer's website\./, "the explicit no-redirect statement is kept");

  const how = plain(read("app/how-we-verify/page.tsx"));
  assert.match(how, /We keep that website as verification data; it is not published or linked on the public page\./);
});

test("public copy: the verification and trust wording the SEO and the badge rely on is still present", () => {
  const badge = read("components/official-website-verified-badge.tsx");
  assert.match(badge, /Official website verified by Developer Connects/);
  const devPage = read("lib/developer-connect/developer-page-content.ts");
  assert.match(devPage, /Developer Profile \| \$\{SITE_NAME\}/, "the developer page title is a research-first profile title (it no longer promises a website the page does not link)");
  assert.match(devPage, /which has verified its official website, and get expert help when you are ready\./);
});

// =================================================================================================
// POSITIONING GUARD — research first, then request a connection through Developer Connects
// =================================================================================================

/**
 * Phrases that present Developer Connects as a broker-free / direct-to-developer channel, or claim
 * independence or a fee position. They must not appear in anything a visitor reads. (Code identifiers and
 * the guide's URL path keep the old "buy-direct" name — renaming a URL is a routing/SEO change, not copy —
 * so those are removed before matching.)
 */
const RETIRED: RegExp[] = [
  /without a broker/i,
  /skip the broker/i,
  /\bno[- ]broker/i,
  /zero[- ]brokerage/i,
  /commission[- ]free/i,
  /independent (advice|advisor|adviser|guidance)/i,
  /(buy|buying|bought|purchase|purchasing)\s+(property\s+|a home\s+|homes\s+)?directly\s+(from|with)/i,
  /\bbuy[- ]direct\b/i,
  /going direct/i,
  /go (directly|straight) to (the )?(source|developer)/i,
  /external developer websites we link to/i,
  /reach genuine developer websites/i,
  /a direct link to each/i,
  /an\s+a directory/i,
];

const withoutIdentifiers = (text: string) =>
  text
    .replace(/\/buy-direct-from-developer(\/\[market\])?/g, " ")
    .replace(/buy-direct-guide-sections|buy-direct-guides/g, " ")
    .replace(/\b(BUY_DIRECT_\w+|BuyDirect\w*|buyDirect\w*)\b/g, " ");

test("positioning: no public file uses a retired phrase (broker-free, direct-to-developer, independence, stale link wording)", () => {
  const offenders: string[] = [];
  for (const file of PUBLIC_FILES) {
    const text = withoutIdentifiers(plain(code(read(file))));
    for (const pattern of RETIRED) {
      const hit = text.match(pattern);
      if (hit) offenders.push(`${file}: "${hit[0]}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("positioning: the guide FAQ and steps no longer carry the unsupported price claim or the 'buy directly' framing", () => {
  const text = [...BUY_DIRECT_STEPS.map((step) => step.title + " " + step.body), ...buyDirectFaq().map((item) => item.question + " " + item.answer)].join(" ");
  assert.doesNotMatch(text, /same list price|usually set|cheaper to buy|buy(ing)? directly|without a broker|skip the broker/i);
  assert.match(text, /Prices, offers and payment plans come from the developer's sales team, so ask for the current figures in writing/);
  assert.match(text, /How do I compare the real cost of a purchase\?/);
});

test("positioning: the research journey wording is in place on the home page, the guide hub and the FAQ", () => {
  assert.match(plain(read("app/(marketing)/page.tsx")), /Research a developer before you buy/);
  const hub = plain(read("app/buy-direct-from-developer/page.tsx"));
  assert.match(hub, /How to research a developer before you buy/);
  assert.match(hub, /Whoever helps you, check the basics/);
  assert.match(hub, /Ask anyone who helps you how they are paid and whether a fee applies/);
  const faq = plain(read("app/faq/page.tsx"));
  assert.match(faq, /What should I check before I buy a property\?/);
  assert.match(faq, /You can request a connection from a developer's page, and our property team will help with your enquiry/);
});

test("terms: the clauses describe the real product — no link to a developer website, only what the service does", () => {
  const terms = plain(read("app/terms/page.tsx"));
  assert.match(terms, /search for and discover genuine developers and to request property assistance/);
  assert.match(terms, /including information provided by developers or other third parties/);
  assert.match(terms, /Developer Connects does not send you to developers' own websites/);
  assert.doesNotMatch(terms, /websites we link to|reach genuine developer websites/);
});
