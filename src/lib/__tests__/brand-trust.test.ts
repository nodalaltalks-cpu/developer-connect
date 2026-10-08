import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURED_DEVELOPERS, FEATURED_SELECTION_NOTE, featuredFor } from "../featured-developers.ts";
import { FOUNDER, FOUNDER_STORIES, pickFounderStory } from "../founder.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../..", relative), "utf8");

const PUBLIC_BRAND_FILES = [
  "src/app/(marketing)/page.tsx",
  "src/app/advisor/page.tsx",
  "src/app/contact/page.tsx",
  "src/components/advisor/advisor.tsx",
  "src/components/featured-developers.tsx",
  "src/components/founder-section.tsx",
  "src/components/buyer-journey.tsx",
  "src/lib/featured-developers.ts",
  "src/lib/founder.ts",
  "src/lib/advisor-contact.ts",
];

test("brand copy: no broker or independence language, no fake scale, no ranking or review claims on the new public surfaces", () => {
  for (const file of PUBLIC_BRAND_FILES) {
    // Strip comments: the rules are explained there in words that would otherwise trip the scan.
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [/\bbroker/i, /brokerage/i, /\bindependent\b/i, /30,000/, /#\s?1\b/, /best developer/i, /top[- ]rated/i, /\bverified developer/i, /guarantee/i, /\b5[- ]star/i]) {
      assert.ok(!banned.test(code), `${file} must not contain ${banned}`);
    }
  }
});

test("featured developers: a small, unique, alphabetical-per-market list, never described as a ranking", () => {
  const slugs = FEATURED_DEVELOPERS.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const market of ["mumbai", "dubai"] as const) {
    const list = featuredFor(market);
    assert.ok(list.length >= 4 && list.length <= 8, `${market}: a curated handful, not a directory`);
    assert.deepEqual(list.map((d) => d.slug), [...list.map((d) => d.slug)].sort(), `${market}: alphabetical, so order implies nothing`);
  }
  assert.match(FEATURED_SELECTION_NOTE, /not a ranking/i);
  assert.match(FEATURED_SELECTION_NOTE, /not an endorsement/i);
  for (const d of FEATURED_DEVELOPERS) if (d.logo) assert.match(d.logo, /^\/developers\/logos\//, "a logo is only ever an official file placed in /public/developers/logos");
});

test("featured developers: the homepage shows a developer only if it is an ACTIVE public developer, and never links to a developer website", () => {
  const home = read("src/app/(marketing)/page.tsx");
  assert.match(home, /getPublicDeveloperBySlug\(repos, entry\.slug\)/);
  assert.match(home, /profile \? \[/, "a missing or inactive profile produces no card");
  const card = read("src/components/featured-developers.tsx");
  assert.ok(!/officialWebsite|href=\{`https?:/.test(card), "no external developer link");
  assert.match(card, /href=\{`\/developers\/\$\{card\.slug\}`\}/);
});

test("founder: the authorised claims are worded exactly, framed as personal experience, and never read as platform statistics", () => {
  assert.equal(FOUNDER.name, "Ambish Singh");
  assert.equal(FOUNDER.linkedinUrl, "https://www.linkedin.com/in/ambishsingh");
  assert.deepEqual([...FOUNDER.facts], [
    "6+ years of real estate experience across India and the UAE.",
    "Built relationships across a network of 10,000+ developers.",
    "Personally contributed to ₹300 Cr+ in property transactions during a real estate career.",
    "MBA completed in Dubai.",
  ]);
  const [experience, network, transacted, mba] = FOUNDER.facts;
  // The network is a relationship claim: nothing that says developers are listed, active, verified or on the platform.
  assert.ok(!/listed|active|verified|platform|on developer connects|our developers|we /i.test(network));
  // The transaction figure is personal and historical: never revenue, volume, GMV, "we" or the company.
  assert.match(transacted, /^Personally contributed to/);
  assert.ok(!/revenue|volume|gmv|turnover|\bwe\b|\bour\b|developer connects/i.test(transacted));
  // The MBA is stated as given: no institution, specialisation, date or distinction was supplied, so none is added.
  assert.equal(mba, "MBA completed in Dubai.");
  assert.ok(!/university|college|school|institute|specialis|distinction|honou?rs|cum laude|batch|\b20\d\d\b/i.test(mba));
  assert.match(experience, /^6\+ years of real estate experience across India and the UAE\.$/);
  assert.match(FOUNDER.context, /not Developer Connects platform statistics/);
  const section = read("src/components/founder-section.tsx");
  assert.match(section, /FOUNDER\.facts\.map/);
  assert.match(section, /\{FOUNDER\.context\}/, "the framing sits right beside the facts");
  assert.ok(!/follower|connections/i.test(section));
  assert.ok(!/Harvard|Stanford|Wharton|Oxford/i.test(read("src/lib/founder.ts") + section), "no borrowed institutions");
});

test("founder: the large figures appear ONLY in the founder's own words, never beside a platform count", () => {
  const files = ["src/app/(marketing)/page.tsx", "src/app/about/page.tsx", "src/app/advisor/page.tsx", "src/components/featured-developers.tsx", "src/components/buyer-journey.tsx", "src/app/buy-direct-from-developer/[market]/page.tsx"];
  for (const file of files) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/10,000|₹\s?300|300 Cr/.test(code), `${file} must not hard-code the founder's figures; they come from lib/founder.ts`);
  }
  assert.match(read("src/app/about/page.tsx"), /<FounderSection \/>/);
  assert.match(read("src/app/(marketing)/page.tsx"), /<FounderSection \/>/);
});

test("founder stories: rotation only chooses between approved entries, deterministically, and falls back safely", () => {
  assert.ok(FOUNDER_STORIES.length >= 1);
  const library = [
    { id: "a", market: "any" as const, title: "A", body: "a" },
    { id: "m", market: "mumbai" as const, title: "M", body: "m" },
    { id: "d", market: "dubai" as const, title: "D", body: "d" },
  ];
  assert.deepEqual([0, 1, 2, 3].map((v) => pickFounderStory("mumbai", v, library).id), ["a", "m", "a", "m"]);
  assert.deepEqual([0, 1].map((v) => pickFounderStory("dubai", v, library).id), ["a", "d"]);
  assert.equal(pickFounderStory("mumbai", -3, library).id, "m", "never an out-of-range index");
  assert.equal(pickFounderStory("dubai", 7).id, FOUNDER_STORIES[0].id, "with one approved story, that story");
});
