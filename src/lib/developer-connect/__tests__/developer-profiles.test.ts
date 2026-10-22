import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVELOPER_PROFILES, getDeveloperProfile } from "../developer-profiles.ts";

const BANNED = [/\bverified\b/i, /\bguarantee/i, /\bbest\b/i, /\bno\.?\s?1\b/i, /#\s?1\b/, /\bzero (?:brokerage|fees?)\b/i, /\b0%/, /\bbrokerage\b/i, /\bbroker\b/i, /\btrusted\b/i, /\bleading\b/i, /\btop\b/i, /\blargest\b/i];

function allText(profile: (typeof DEVELOPER_PROFILES)[number]): string[] {
  return [profile.summary, ...profile.facts.flatMap((f) => [f.label, f.value]), ...profile.sources.map((s) => s.name), profile.checked];
}

test("developer profiles: unique slugs, a short summary, 3-5 facts and at least two sources each", () => {
  const slugs = new Set<string>();
  for (const profile of DEVELOPER_PROFILES) {
    assert.ok(!slugs.has(profile.slug), `duplicate slug ${profile.slug}`);
    slugs.add(profile.slug);
    assert.ok(profile.summary.length > 20 && profile.summary.length <= 220, `${profile.slug} summary length`);
    assert.ok(profile.facts.length >= 3 && profile.facts.length <= 5, `${profile.slug} should have 3-5 facts`);
    assert.ok(profile.sources.length >= 2, `${profile.slug} needs two sources`);
    for (const source of profile.sources) assert.match(source.url, /^https:\/\//, `${profile.slug} source url`);
    assert.match(profile.checked, /^[A-Z][a-z]+ 20\d\d$/, `${profile.slug} checked month`);
  }
});

test("developer profiles: neutral wording only (no praise, ranking or verification language, no figures that sources dispute)", () => {
  for (const profile of DEVELOPER_PROFILES) {
    for (const text of allText(profile)) {
      for (const banned of BANNED) assert.doesNotMatch(text, banned, `${profile.slug}: "${text}" matches ${banned}`);
      assert.doesNotMatch(text, /revenue|crore|billion|₹|AED \d/i, `${profile.slug}: no money figures`);
    }
  }
});

test("developer profiles: lookup by slug", () => {
  assert.equal(getDeveloperProfile("lodha")?.slug, "lodha");
  assert.equal(getDeveloperProfile("no-such-developer"), null);
});
