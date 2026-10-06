import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLandingPath, cleanReferrer, cleanTouch, isDirectTouch } from "../attribution.ts";
import { CONSENT_PURPOSE, CONSENT_TEXT_VERSION, consentTextFor } from "../consent.ts";
import { formatBudget, formatDuration, formatMoney, formatTimeline } from "../format.ts";
import { isRedacted, redactPayload } from "../redaction.ts";
import { LEAD_EVENT_TYPES } from "../types.ts";

// --- attribution cleaning ----------------------------------------------------------------------

test("attribution: a referrer is reduced to origin + path — its query string (which can hold personal data) is dropped", () => {
  assert.equal(cleanReferrer("https://www.google.com/search?q=flats+for+asha%40example.com&utm=1#x"), "https://www.google.com/search");
  assert.equal(cleanReferrer("https://t.co/abc?email=a@b.com"), "https://t.co/abc");
});

test("attribution: non-web or unparseable referrers become null", () => {
  assert.equal(cleanReferrer("android-app://com.google.android.gm"), null);
  assert.equal(cleanReferrer("not a url"), null);
  assert.equal(cleanReferrer(""), null);
  assert.equal(cleanReferrer(null), null);
});

test("attribution: a landing path keeps only the same-site path", () => {
  assert.equal(cleanLandingPath("/developers/acme?utm_source=google&email=a@b.com#top"), "/developers/acme");
  assert.equal(cleanLandingPath("https://evil.example/phish"), null);
  assert.equal(cleanLandingPath("//evil.example"), "//evil.example".startsWith("/") ? "//evil.example" : null);
  assert.equal(cleanLandingPath(""), null);
});

test("attribution: empty values become null (never the empty string) and UTM source/medium are lower-cased", () => {
  const touch = cleanTouch({ sessionId: "s1", utmSource: "  Google ", utmMedium: "CPC", utmCampaign: " ", gclid: "" });
  assert.equal(touch.utmSource, "google");
  assert.equal(touch.utmMedium, "cpc");
  assert.equal(touch.utmCampaign, null);
  assert.equal(touch.gclid, null);
});

test("attribution: oversized values are capped, so the immutable table can never be filled with junk", () => {
  const touch = cleanTouch({ sessionId: "s".repeat(500), utmCampaign: "c".repeat(5000), gclid: "g".repeat(5000) });
  assert.ok(touch.sessionId.length <= 100);
  assert.ok((touch.utmCampaign ?? "").length <= 200);
  assert.ok((touch.gclid ?? "").length <= 300);
});

test("attribution: a touch with no campaign, referrer or click id is 'direct'", () => {
  assert.equal(isDirectTouch(cleanTouch({ sessionId: "s1", landingPath: "/" })), true);
  assert.equal(isDirectTouch(cleanTouch({ sessionId: "s1", utmSource: "google" })), false);
  assert.equal(isDirectTouch(cleanTouch({ sessionId: "s1", gclid: "abc" })), false);
  assert.equal(isDirectTouch(cleanTouch({ sessionId: "s1", referrer: "https://google.com/" })), false);
});

// --- consent text ------------------------------------------------------------------------------

test("consent: the wording names Developer Connects as the recipient and never implies the developer needs the number", () => {
  for (const channel of ["WHATSAPP", "PHONE_CALL", "EMAIL"] as const) {
    const text = consentTextFor(channel);
    assert.match(text, /Developer Connects may contact me/);
    assert.match(text, /not with the developer/);
    assert.doesNotMatch(text, /developer (requires|needs|asks)/i);
  }
  assert.match(consentTextFor("WHATSAPP"), /on WhatsApp/);
  assert.match(consentTextFor("PHONE_CALL"), /by phone call/);
  assert.ok(CONSENT_TEXT_VERSION.length > 0);
  assert.equal(CONSENT_PURPOSE, "PROPERTY_ASSISTANCE");
});

// --- formatting --------------------------------------------------------------------------------

test("format: Indian rupee amounts read in Cr and L", () => {
  assert.equal(formatMoney(20_000_000, "INR"), "₹2 Cr");
  assert.equal(formatMoney(15_000_000, "INR"), "₹1.5 Cr");
  assert.equal(formatMoney(7_500_000, "INR"), "₹75 L");
  assert.equal(formatMoney(50_000, "INR"), "₹50,000");
});

test("format: dirham amounts read in M and K", () => {
  assert.equal(formatMoney(1_500_000, "AED"), "AED 1.5M");
  assert.equal(formatMoney(900_000, "AED"), "AED 900K");
  assert.equal(formatMoney(500, "AED"), "AED 500");
});

test("format: budgets read as a single figure, a minimum, or a range — and null when unknown", () => {
  assert.equal(formatBudget(null, 20_000_000, "INR"), "₹2 Cr budget");
  assert.equal(formatBudget(20_000_000, null, "INR"), "₹2 Cr+ budget");
  assert.equal(formatBudget(15_000_000, 20_000_000, "INR"), "₹1.5 Cr–₹2 Cr budget");
  assert.equal(formatBudget(20_000_000, 20_000_000, "INR"), "₹2 Cr budget");
  assert.equal(formatBudget(null, null, "INR"), null);
  assert.equal(formatBudget(1, 2, null), null);
});

test("format: durations read in plain words and never go negative", () => {
  assert.equal(formatDuration(10 * 60_000), "under an hour");
  assert.equal(formatDuration(3_600_000), "1 hour");
  assert.equal(formatDuration(18 * 3_600_000), "18 hours");
  assert.equal(formatDuration(47 * 3_600_000), "47 hours");
  assert.equal(formatDuration(72 * 3_600_000), "3 days");
  assert.equal(formatDuration(-5000), "under an hour");
});

test("format: every timeline has a phrase", () => {
  assert.equal(formatTimeline("WITHIN_30_DAYS"), "wants to buy within 30 days");
  assert.equal(formatTimeline("JUST_EXPLORING"), "just exploring");
});

// --- redaction (allowlist) ---------------------------------------------------------------------

test("redaction: every event type has an explicit allowlist (none is forgotten)", () => {
  for (const type of LEAD_EVENT_TYPES) {
    const result = redactPayload(type, { surprise: "x", note: "private" });
    assert.equal(isRedacted(result), true, type);
    assert.equal("surprise" in result, false, `${type} kept an unlisted key`);
    assert.equal("note" in result, false, `${type} kept a note`);
  }
});

test("redaction: NOTE_ADDED and CONTACT_LOGGED lose their free text; structured fields survive", () => {
  assert.deepEqual(redactPayload("NOTE_ADDED", { note: "Asha wants a sea view, call after 6" }), { redacted: true });
  assert.deepEqual(redactPayload("CONTACT_LOGGED", { channel: "WHATSAPP", outcome: "CONNECTED", note: "spoke to her husband" }), {
    channel: "WHATSAPP",
    outcome: "CONNECTED",
    redacted: true,
  });
});

test("redaction: a status change keeps its structured reason code but not the typed note", () => {
  assert.deepEqual(redactPayload("STATUS_CHANGED", { reasonCode: "PRICE", note: "said Rakesh's flat was cheaper" }), {
    reasonCode: "PRICE",
    redacted: true,
  });
});

test("redaction: a requirement update drops the free-text location but keeps the structured fields", () => {
  const result = redactPayload("REQUIREMENT_UPDATED", {
    fields: { location: { from: null, to: "Flat 402, Tower A, Andheri" }, timeline: { from: null, to: "WITHIN_30_DAYS" } },
  });
  assert.deepEqual(result, { fields: { timeline: { from: null, to: "WITHIN_30_DAYS" } }, redacted: true });
});

test("redaction: the connect-request event keeps only the developer facts, source and time — and never any website", () => {
  const result = redactPayload("DEVELOPER_CONNECT_REQUESTED", {
    developerSlug: "acme-realty",
    developerName: "Acme Realty",
    sourceCta: "developer_page",
    requestedAt: "2026-10-05T10:00:00.000Z",
    websiteUrl: "https://acme.example/",
    note: "typed text",
  });
  assert.deepEqual(result, {
    developerSlug: "acme-realty",
    developerName: "Acme Realty",
    sourceCta: "developer_page",
    requestedAt: "2026-10-05T10:00:00.000Z",
    redacted: true,
  });
});

test("redaction: the (legacy) website-click event keeps the developer facts (needed for developer analytics) and nothing else", () => {
  const result = redactPayload("OFFICIAL_WEBSITE_CLICKED", {
    developerSlug: "acme",
    developerName: "Acme",
    websiteDomain: "acme.example",
    websiteUrl: "https://acme.example/",
    verifiedAt: "2026-09-01T00:00:00.000Z",
    sourceCta: "developer_page",
    clickedAt: "2026-10-05T10:00:00.000Z",
    sessionEcho: "abc",
  });
  assert.equal(result.developerSlug, "acme");
  assert.equal(result.websiteDomain, "acme.example");
  assert.equal("sessionEcho" in result, false);
});

test("redaction: is idempotent", () => {
  const once = redactPayload("STATUS_CHANGED", { reasonCode: "PRICE", note: "x" });
  assert.deepEqual(redactPayload("STATUS_CHANGED", once), once);
});
