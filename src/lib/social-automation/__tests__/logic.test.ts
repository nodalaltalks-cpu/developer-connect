import { test } from "node:test";
import assert from "node:assert/strict";
import { choosePublicReply, decideDm, DEFAULT_PUBLIC_REPLY, formatProjectPrice, matchTrigger, priceBlockers, priceFingerprint, renderTemplate } from "../logic.ts";
import { validatePostInput } from "../input.ts";
import { describePriceState } from "../view.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { PostConfig, ProjectFacts, TriggerConfig } from "../types.ts";

/** Pure rules only: no database, no network, nothing is ever sent. */

const NOW = new Date("2026-10-24T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const PRICE: TriggerConfig = { keyword: "PRICE", intent: "PRICE", dmTemplate: "Hi! Thanks for your interest in [Property Name] in [Location]. The asking price currently listed is [Verified Price]. Would you like more details?" };
const LOCATION: TriggerConfig = { keyword: "LOCATION", intent: "LOCATION", dmTemplate: "Hi! Thanks for your interest in [Property Name]. It is located in [Verified Location]." };
const DETAILS: TriggerConfig = { keyword: "DETAILS", intent: "DETAILS", dmTemplate: "Details I can confirm for [Property Name]: [Approved Details]." };
const AVAIL: TriggerConfig = { keyword: "AVAILABILITY", intent: "AVAILABILITY", dmTemplate: "[Property Name]: [Availability]." };

const projectA: ProjectFacts = { id: "11111111-1111-4111-8111-111111111111", name: "Skyline Heights", city: "Mumbai", locality: "Bandra", priceMin: 25_000_000, priceMax: 40_000_000, currency: "INR", status: "ACTIVE" };
const projectB: ProjectFacts = { id: "22222222-2222-4222-8222-222222222222", name: "Palm Residences", city: "Dubai", locality: "Palm Jumeirah", priceMin: 1_500_000, priceMax: 2_500_000, currency: "AED", status: "ACTIVE" };

function config(project: ProjectFacts, over: Partial<PostConfig> = {}): PostConfig {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    platform: "INSTAGRAM",
    postId: "1789",
    postUrl: null,
    videoTitle: "Walkthrough",
    contentFormat: "REEL",
    mode: "DRY_RUN",
    projectId: project.id,
    priceApproved: true,
    priceVerifiedAt: daysAgo(2),
    priceSnapshot: priceFingerprint(project),
    availabilityText: "2 and 3 BHK available",
    availabilityVerifiedAt: daysAgo(1),
    approvedDetails: "Sea-facing, 3 towers, possession 2028.",
    safeFallbackTemplate: "Hi! Thanks for your interest in [Property Name] in [Location]. I'll get back to you personally.",
    publicReplyTemplate: null,
    publicReplyFallbackTemplate: null,
    triggers: [PRICE, LOCATION, DETAILS, AVAIL],
    ...over,
  };
}

// --- matching ----------------------------------------------------------------------------------------------------

test("matching: case, punctuation and emoji are ignored; whole words only", () => {
  const triggers = [PRICE, LOCATION];
  assert.equal(matchTrigger("PRICE", triggers)?.keyword, "PRICE");
  assert.equal(matchTrigger("price??", triggers)?.keyword, "PRICE");
  assert.equal(matchTrigger("Pls share the Price 🙏", triggers)?.keyword, "PRICE");
  assert.equal(matchTrigger("what is the price-range", triggers)?.keyword, "PRICE");
  assert.equal(matchTrigger("pricey", triggers), null, "a longer word is not the keyword");
  assert.equal(matchTrigger("nice video", triggers), null);
  assert.equal(matchTrigger("", triggers), null);
  assert.equal(matchTrigger(undefined, triggers), null);
});

test("matching: multi-word keywords and the Founder's order of priority", () => {
  const triggers: TriggerConfig[] = [{ keyword: "SITE VISIT", intent: "VISIT", dmTemplate: "x" }, LOCATION, PRICE];
  assert.equal(matchTrigger("can I book a site   visit?", triggers)?.keyword, "SITE VISIT");
  assert.equal(matchTrigger("price and location", triggers)?.keyword, "LOCATION", "the first listed trigger wins");
});

// --- price and currency ------------------------------------------------------------------------------------------

test("price: a fresh, approved, unchanged price is sent in its own currency", () => {
  const d = decideDm(config(projectA), PRICE, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(d.action, "SEND");
  if (d.action === "SEND") {
    assert.equal(d.usedFallback, false);
    assert.match(d.text, /Skyline Heights in Bandra, Mumbai/);
    assert.match(d.text, /₹2\.5 Cr – ₹4 Cr/);
    assert.doesNotMatch(d.text, /AED/);
  }
});

test("currency: AED projects are written in AED only and never converted or mixed with INR", () => {
  assert.equal(formatProjectPrice(projectB), "AED 1.5M – AED 2.5M");
  const d = decideDm(config(projectB), PRICE, projectB, DEFAULT_SETTINGS, NOW);
  assert.equal(d.action, "SEND");
  if (d.action === "SEND") {
    assert.match(d.text, /AED 1\.5M – AED 2\.5M/);
    assert.doesNotMatch(d.text, /₹/);
  }
  // A project with a price but no currency cannot be quoted at all.
  assert.equal(formatProjectPrice({ priceMin: 5, priceMax: 9, currency: null }), null);
  assert.equal(priceFingerprint({ priceMin: 5, priceMax: 9, currency: null }), null);
});

test("price: older than the window, never verified, not approved, changed or missing => the price is withheld", () => {
  const cases: Array<[string, Partial<PostConfig>, string]> = [
    ["stale", { priceVerifiedAt: daysAgo(15) }, "price_stale"],
    ["never verified", { priceVerifiedAt: null }, "price_never_verified"],
    ["not approved", { priceApproved: false }, "price_not_approved"],
    ["verification dated in the future", { priceVerifiedAt: new Date(NOW.getTime() + 86_400_000) }, "price_stale"],
    ["no snapshot", { priceSnapshot: null }, "price_changed_since_verification"],
  ];
  for (const [name, over, reason] of cases) {
    assert.ok(priceBlockers(config(projectA, over), projectA, DEFAULT_SETTINGS, NOW).includes(reason), name);
    const d = decideDm(config(projectA, over), PRICE, projectA, DEFAULT_SETTINGS, NOW);
    assert.equal(d.action, "SEND", name);
    if (d.action === "SEND") {
      assert.equal(d.usedFallback, true, `${name}: safe fallback`);
      assert.doesNotMatch(d.text, /₹|AED|price/i, `${name}: no price leaks into the fallback`);
      assert.ok(d.reasons.includes(reason), name);
    }
  }
  // Exactly at the limit is still fresh; one day more is not.
  assert.deepEqual(priceBlockers(config(projectA, { priceVerifiedAt: daysAgo(14) }), projectA, DEFAULT_SETTINGS, NOW), []);
  assert.deepEqual(priceBlockers(config(projectA, { priceVerifiedAt: daysAgo(20) }), projectA, { ...DEFAULT_SETTINGS, priceMaxAgeDays: 30 }, NOW), []);
});

test("price: changing the project's price after verification invalidates the approval", () => {
  const cfg = config(projectA);
  const repriced = { ...projectA, priceMax: 45_000_000 };
  assert.deepEqual(priceBlockers(cfg, projectA, DEFAULT_SETTINGS, NOW), []);
  assert.deepEqual(priceBlockers(cfg, repriced, DEFAULT_SETTINGS, NOW), ["price_changed_since_verification"]);
  const noPrice = { ...projectA, priceMin: null, priceMax: null, currency: null };
  assert.deepEqual(priceBlockers(cfg, noPrice, DEFAULT_SETTINGS, NOW), ["price_missing"]);
  assert.match(describePriceState(cfg, repriced, DEFAULT_SETTINGS, NOW), /changed after you verified/);
});

test("no fallback configured: a withheld price sends nothing and goes to manual follow-up", () => {
  const cfg = config(projectA, { priceVerifiedAt: daysAgo(30), safeFallbackTemplate: null });
  const d = decideDm(cfg, PRICE, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(d.action, "MANUAL");
  if (d.action === "MANUAL") assert.ok(d.reasons.includes("price_stale") && d.reasons.includes("no_safe_fallback"));
});

test("fallback template can only use name and location, never a price", () => {
  const cfg = config(projectA, { priceVerifiedAt: daysAgo(30), safeFallbackTemplate: "Price is [Verified Price]" });
  const d = decideDm(cfg, PRICE, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(d.action, "MANUAL");
});

// --- availability, details, wrong property -----------------------------------------------------------------------

test("availability is verified separately from price and has its own window", () => {
  const priceOk = config(projectA, { availabilityVerifiedAt: daysAgo(8) });
  assert.equal(decideDm(priceOk, PRICE, projectA, DEFAULT_SETTINGS, NOW).action, "SEND");
  const availStale = decideDm(priceOk, AVAIL, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(availStale.action, "SEND");
  if (availStale.action === "SEND") {
    assert.equal(availStale.usedFallback, true);
    assert.ok(availStale.reasons.includes("availability_stale"));
    assert.doesNotMatch(availStale.text, /BHK/);
  }
  const never = decideDm(config(projectA, { availabilityVerifiedAt: null }), AVAIL, projectA, DEFAULT_SETTINGS, NOW);
  assert.ok(never.action === "SEND" && never.reasons.includes("availability_never_verified"));
  const missing = decideDm(config(projectA, { availabilityText: null }), AVAIL, projectA, DEFAULT_SETTINGS, NOW);
  assert.ok(missing.action === "SEND" && missing.reasons.includes("availability_missing"));
});

test("missing approved details are never invented", () => {
  const d = decideDm(config(projectA, { approvedDetails: null }), DETAILS, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(d.action, "SEND");
  if (d.action === "SEND") {
    assert.equal(d.usedFallback, true);
    assert.ok(d.reasons.includes("details_missing"));
  }
  const ok = decideDm(config(projectA), DETAILS, projectA, DEFAULT_SETTINGS, NOW);
  assert.ok(ok.action === "SEND" && /Sea-facing, 3 towers/.test(ok.text));
});

test("each property uses its own facts and template; a mismatched project is refused", () => {
  const a = decideDm(config(projectA), PRICE, projectA, DEFAULT_SETTINGS, NOW);
  const b = decideDm(config(projectB, { triggers: [LOCATION] }), LOCATION, projectB, DEFAULT_SETTINGS, NOW);
  assert.ok(a.action === "SEND" && b.action === "SEND");
  if (a.action === "SEND" && b.action === "SEND") {
    assert.match(a.text, /Skyline Heights/);
    assert.match(b.text, /Palm Residences.*Palm Jumeirah, Dubai/);
    assert.doesNotMatch(b.text, /Skyline|Bandra/);
  }
  // The post is linked to A but B's facts are handed in: refuse rather than mix them.
  assert.deepEqual(decideDm(config(projectA), PRICE, projectB, DEFAULT_SETTINGS, NOW), { action: "MANUAL", reasons: ["project_missing"] });
  assert.deepEqual(decideDm(config(projectA, { projectId: null }), PRICE, null, DEFAULT_SETTINGS, NOW), { action: "MANUAL", reasons: ["project_missing"] });
  assert.deepEqual(decideDm(config(projectA), PRICE, { ...projectA, status: "INACTIVE" }, DEFAULT_SETTINGS, NOW), { action: "MANUAL", reasons: ["project_inactive"] });
});

test("templates: unknown placeholders and over-long messages fail instead of sending a gap", () => {
  const cfg = config(projectA);
  const unknown = renderTemplate("Hi [Buyer Name], [Property Name]", cfg, projectA, DEFAULT_SETTINGS, NOW);
  assert.equal(unknown.ok, false);
  const long = renderTemplate(`[Property Name] ${"x".repeat(1000)}`, cfg, projectA, DEFAULT_SETTINGS, NOW);
  assert.deepEqual(long, { ok: false, reasons: ["message_too_long"] });
  assert.equal(renderTemplate("   ", cfg, projectA, DEFAULT_SETTINGS, NOW).ok, false);
});

// --- public reply ------------------------------------------------------------------------------------------------

test("public reply only claims a DM when one was sent", () => {
  const none = { publicReplyTemplate: null, publicReplyFallbackTemplate: null };
  assert.equal(choosePublicReply(none, true), DEFAULT_PUBLIC_REPLY);
  assert.equal(choosePublicReply(none, false), null, "no fallback configured: no public reply at all");
  assert.equal(choosePublicReply({ publicReplyTemplate: "Sent!", publicReplyFallbackTemplate: "We'll reply soon." }, true), "Sent!");
  assert.equal(choosePublicReply({ publicReplyTemplate: "Sent!", publicReplyFallbackTemplate: "We'll reply soon." }, false), "We'll reply soon.");
});

// --- input validation --------------------------------------------------------------------------------------------

const VALID = {
  platform: "INSTAGRAM",
  postId: "17890000000000001",
  postUrl: "https://www.instagram.com/reel/abc/",
  videoTitle: "Skyline walkthrough",
  contentFormat: "REEL",
  projectId: projectA.id,
  triggers: [{ keyword: "price", intent: "PRICE", dmTemplate: PRICE.dmTemplate }],
};

test("input: a valid post is accepted and keywords are upper-cased", () => {
  const r = validatePostInput(VALID);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.triggers[0].keyword, "PRICE");
});

test("input: rejects bad links, duplicate keywords, unknown placeholders and a fallback that claims a DM", () => {
  const bad = (patch: Record<string, unknown>) => validatePostInput({ ...VALID, ...patch });
  assert.equal(bad({ postUrl: "http://www.instagram.com/p/x" }).ok, false);
  assert.equal(bad({ postUrl: "https://evil.example.com/p/x" }).ok, false);
  assert.equal(bad({ platform: "YOUTUBE" }).ok, false);
  assert.equal(bad({ postId: "a b" }).ok, false);
  assert.equal(bad({ triggers: [] }).ok, false);
  assert.equal(bad({ triggers: [VALID.triggers[0], { ...VALID.triggers[0], keyword: "Price" }] }).ok, false);
  assert.equal(bad({ triggers: [{ ...VALID.triggers[0], dmTemplate: "Hi [Buyer]" }] }).ok, false);
  assert.equal(bad({ safeFallbackTemplate: "Price: [Verified Price]" }).ok, false);
  assert.equal(bad({ publicReplyTemplate: "Hi [Property Name]" }).ok, false);
  assert.equal(bad({ publicReplyFallbackTemplate: "I've sent you a DM." }).ok, false);
  assert.equal(bad({ projectId: "not-a-uuid" }).ok, false);
});
