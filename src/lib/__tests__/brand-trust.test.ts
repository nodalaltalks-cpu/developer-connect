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

test("founder: only substantiated claims are public, the LinkedIn link is the real one, and nothing is scraped", () => {
  assert.equal(FOUNDER.name, "Ambish Singh");
  assert.equal(FOUNDER.linkedinUrl, "https://www.linkedin.com/in/ambishsingh");
  assert.match(FOUNDER.experience, /6\+ years/);
  assert.equal(FOUNDER.education, null, "the MBA is not claimed until its current status is confirmed");
  assert.equal(FOUNDER.transactedValue, null, "the property-value figure is not claimed until it is evidenced");
  const section = read("src/components/founder-section.tsx");
  assert.match(section, /FOUNDER\.education &&/);
  assert.match(section, /FOUNDER\.transactedValue &&/);
  assert.ok(!/follower|connections/i.test(section));
  assert.ok(!/Harvard|Stanford|Wharton|Oxford/i.test(read("src/lib/founder.ts") + section), "no borrowed institutions");
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
