import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alsoKnownAs,
  buildDeveloperMetadataText,
  developerIntroText,
  serializeJsonLd,
} from "../developer-page-content.ts";
import { toPublicDeveloperProfile, type PublicDeveloperProfile } from "../public-view.ts";
import type { Developer, WebsiteCandidate } from "../types.ts";

const developer: Developer = {
  id: "d1",
  legalName: "Acme Realty Private Limited",
  displayName: "Acme Realty",
  slug: "acme-realty",
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  status: "ACTIVE",
  pendingChanges: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-03-03T00:00:00Z"),
};

function verifiedCandidate(overrides: Partial<WebsiteCandidate> = {}): WebsiteCandidate {
  return {
    id: "c1",
    developerId: "d1",
    url: "https://www.acme.example/",
    canonicalDomain: "acme.example",
    discoverySource: "MANUAL_SUBMISSION",
    verificationStatus: "VERIFIED",
    confidenceScore: 0,
    reviewedAt: new Date("2026-02-02T00:00:00Z"),
    lastCheckedAt: new Date("2026-04-04T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-05T00:00:00Z"),
    ...overrides,
  };
}

function profile(dev: Partial<Developer> = {}, candidate: WebsiteCandidate | null = verifiedCandidate()): PublicDeveloperProfile {
  return toPublicDeveloperProfile({ ...developer, ...dev }, candidate);
}

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

// A. P1 — verification date integrity
test("verifiedAt is exactly reviewedAt", () => {
  const p = profile();
  assert.equal(p.officialWebsite?.verifiedAt?.toISOString(), "2026-02-02T00:00:00.000Z");
});

test("verifiedAt is null when reviewedAt is null — never updatedAt/lastCheckedAt/createdAt", () => {
  const p = profile({}, verifiedCandidate({ reviewedAt: undefined }));
  assert.equal(p.officialWebsite?.verifiedAt, null);
});

// B/C. page + sitemap follow the same rule
test("developer page renders 'Last verified' only when verifiedAt exists", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /officialWebsite\.verifiedAt && \(/);
  assert.match(page, /Last verified \{formatDate\(developer\.officialWebsite\.verifiedAt\)\}/);
  assert.doesNotMatch(page, /updatedAt|lastCheckedAt|createdAt/);
});

test("sitemap lastmod comes only from verifiedAt and is omitted when null", () => {
  const sitemap = read("../../sitemap-entries.ts");
  assert.match(sitemap, /officialWebsite\?\.verifiedAt \? \{ lastModified: developer\.officialWebsite\.verifiedAt \} : \{\}/);
  assert.doesNotMatch(sitemap, /updatedAt|lastCheckedAt|createdAt/);
});

// D/E. P2 — metadata
test("verified metadata states official-website intent, with the city when present", () => {
  const { title, description } = buildDeveloperMetadataText(profile());
  assert.equal(title, "Acme Realty Official Website in Mumbai | Developer Connects");
  assert.match(description, /acme\.example/);
  assert.match(description, /Mumbai/);
  assert.match(description, /Developer Connects/);
});

test("verified metadata omits the city when it is blank", () => {
  const { title, description } = buildDeveloperMetadataText(profile({ city: "  " }));
  assert.equal(title, "Acme Realty Official Website | Developer Connects");
  assert.doesNotMatch(description, / in \s*\./);
});

test("developer metadata has no marketing claims", () => {
  for (const p of [profile(), profile({}, null), profile({ city: "" })]) {
    const { title, description } = buildDeveloperMetadataText(p);
    assert.doesNotMatch(`${title} ${description}`, /no brokers|no forms/i);
  }
  assert.doesNotMatch(read("../../../app/developers/[slug]/page.tsx"), /no brokers|no forms/i);
});

// I. unverified developer behaviour is unchanged
test("unverified developer: plain title, not an official-website page, still noindexed", () => {
  const { title, description } = buildDeveloperMetadataText(profile({}, null));
  assert.equal(title, "Acme Realty | Developer Connects");
  assert.doesNotMatch(title, /Official Website/);
  assert.match(description, /verification is in progress/);
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /developer\.officialWebsite \? \{\} : \{ robots: \{ index: false, follow: true \} \}/);
});

// F. P6 — JSON-LD
test("JSON-LD cannot be terminated by a '<' in a developer-controlled value", () => {
  const value = { "@type": "Organization", name: "Evil </script><script>alert(1)</script>" };
  const out = serializeJsonLd(value);
  assert.ok(!out.includes("<"));
  assert.deepEqual(JSON.parse(out), value); // semantics unchanged
});

test("page uses serializeJsonLd, not raw JSON.stringify, for the script body", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /__html: serializeJsonLd\(/);
  assert.doesNotMatch(page, /__html: JSON\.stringify/);
});

// G. P5 — legal name wording
test("legal name is presented as 'Also known as', never 'Registered as'", () => {
  assert.equal(alsoKnownAs(profile()), "Acme Realty Private Limited");
  assert.equal(alsoKnownAs(profile({ legalName: null })), null);
  assert.equal(alsoKnownAs(profile({ legalName: "  " })), null);
  assert.equal(alsoKnownAs(profile({ legalName: "acme realty" })), null);
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /Also known as/);
  assert.doesNotMatch(page, /Registered as/);
});

// H. P7 — one consolidated verification presentation
test("page shows exactly one verification signal and no duplicate blue badge", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.equal((page.match(/<OfficialWebsiteVerifiedBadge/g) ?? []).length, 1);
  assert.doesNotMatch(page, /VerifiedBadge \/>|from "@\/components\/verified-badge"/);
  assert.doesNotMatch(page, /verified by Developer Connects\./);
});

// P3 — duplicate lookups
test("developer loader is wrapped in React cache()", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /import \{ cache \} from "react"/);
  assert.match(page, /const loadDeveloper = cache\(/);
});

// CTA is the stored URL
test("CTA and displayed domain come from the stored verified candidate", () => {
  const p = profile();
  assert.equal(p.officialWebsite?.url, "https://www.acme.example/");
  assert.equal(p.officialWebsite?.canonicalDomain, "acme.example");
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /url=\{developer\.officialWebsite\.url\}/);
});

// --- Visible official-website relationship sentence ------------------------
// A stub formatter keeps these independent of the runtime's time zone.
const fmt = (date: Date) => `<${date.toISOString().slice(0, 10)}>`;

test("intro: a VERIFIED developer states the official-website relationship with name, location, domain, verifier and date", () => {
  assert.equal(
    developerIntroText(profile(), fmt),
    "Acme Realty is a real estate developer in Mumbai, Maharashtra, India. Acme Realty's official website is acme.example, as verified by Developer Connects on <2026-02-02>.",
  );
});

test("intro: the domain shown is the stored canonical domain, not derived from the name or slug", () => {
  const p = profile({}, verifiedCandidate({ url: "https://www.totally-unrelated.example/", canonicalDomain: "totally-unrelated.example" }));
  const text = developerIntroText(p, fmt);
  assert.ok(text.includes("totally-unrelated.example"));
  assert.ok(!text.includes("acme.example"));
  assert.ok(!text.includes("acme-realty"));
});

test("intro: no reliable verification date means no date in the sentence (nothing is invented)", () => {
  const p = profile({}, verifiedCandidate({ reviewedAt: undefined }));
  const text = developerIntroText(p, fmt);
  assert.equal(
    text,
    "Acme Realty is a real estate developer in Mumbai, Maharashtra, India. Acme Realty's official website is acme.example, as verified by Developer Connects.",
  );
  assert.doesNotMatch(text, / on /);
  assert.doesNotMatch(text, /<\d{4}-\d{2}-\d{2}>/);
});

test("intro: an UNVERIFIED developer gets the location sentence only — never a verification claim", () => {
  const text = developerIntroText(profile({}, null), fmt);
  assert.equal(text, "Acme Realty is a real estate developer in Mumbai, Maharashtra, India.");
  assert.doesNotMatch(text, /official website|verified|Developer Connects/i);
});

test("intro: missing optional location parts are omitted rather than printed blank", () => {
  assert.equal(
    developerIntroText(profile({ state: "  " }), fmt),
    "Acme Realty is a real estate developer in Mumbai, India. Acme Realty's official website is acme.example, as verified by Developer Connects on <2026-02-02>.",
  );
  // No location at all: still one factual sentence, naming the developer directly.
  assert.equal(
    developerIntroText(profile({ city: "", state: "", country: "" }), fmt),
    "Acme Realty's official website is acme.example, as verified by Developer Connects on <2026-02-02>.",
  );
  assert.equal(developerIntroText(profile({ city: "", state: "", country: "" }, null), fmt), "");
});

test("intro: one natural statement — the developer name is not repeated as keyword variants", () => {
  const text = developerIntroText(profile(), fmt);
  assert.equal(text.match(/official website/gi)?.length, 1);
  assert.doesNotMatch(text, /official site\b|website of|\bwebsite\b.*\bwebsite\b/i);
});

test("page: renders the sentence from developerIntroText once, and leaves the CTA/card, share, report and related section in place", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.equal((page.match(/developerIntroText\(/g) ?? []).length, 1);
  assert.match(page, /\{introText && <p className="mt-2 text-foreground">\{introText\}<\/p>\}/);
  // The sentence text itself lives in the content module, not hard-coded in the page.
  assert.doesNotMatch(page, /official website is/);
  // Existing UI is unchanged.
  // The CTA is unchanged in place and purpose, but since the assistance gate it no longer receives the destination URL:
  // the server resolves it from the verified record once the buyer's details are saved (see lead-gate-actions.ts).
  const cta = page.match(/<VisitOfficialWebsiteButton[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(cta, /developerId=\{developer\.id\}/);
  assert.match(cta, /developerName=\{developer\.displayName\}/);
  assert.match(cta, /domain=\{developer\.officialWebsite\.canonicalDomain\}/);
  assert.doesNotMatch(cta, /\burl=/, "the browser is never handed the destination URL");
  // The linked domain survives only when the gate is off (never on production); otherwise it is shown as plain text.
  assert.match(page, /<ExternalDomainLink[\s\S]*?url=\{developer\.officialWebsite\.url\}/);
  assert.match(page, /gateRequired \?/);
  assert.match(page, /Last verified \{formatDate\(developer\.officialWebsite\.verifiedAt\)\}/);
  assert.match(page, /<ShareDeveloper /);
  assert.match(page, /<ReportInaccurateInfo /);
  assert.match(page, /Other verified developers in \{developer\.city\}/);
  assert.match(page, /Also known as/);
  assert.equal((page.match(/<OfficialWebsiteVerifiedBadge/g) ?? []).length, 1);
});

// --- /how-we-verify methodology page ----------------------------------------
test("how-we-verify: indexable page with its own title, description and canonical, and no unsupported claims", () => {
  const page = read("../../../app/how-we-verify/page.tsx");
  assert.match(page, /title: "How Developer Connects Verifies Official Developer Websites \| Developer Connects"/);
  assert.match(page, /alternates: \{ canonical: "\/how-we-verify" \}/);
  assert.doesNotMatch(page, /robots|application\/ld\+json/);
  assert.match(page, /<h1[^>]*>\s*How Developer Connects Verifies Official Developer Websites\s*<\/h1>/);
  assert.doesNotMatch(page, /trusted developer|legitimate company|approved developer|genuine developer/i);
  assert.match(page, /not a certification of\s+the developer, its projects or its regulatory status/);
});

test("how-we-verify: linked from the developer page, homepage, about page, footer and sitemap", () => {
  assert.match(read("../../../app/developers/[slug]/page.tsx"), /href="\/how-we-verify"/);
  assert.match(read("../../../app/(marketing)/page.tsx"), /href="\/how-we-verify"/);
  assert.match(read("../../../app/about/page.tsx"), /href="\/how-we-verify"/);
  assert.match(read("../../../components/site-footer.tsx"), /"\/how-we-verify"/);
  assert.match(read("../../sitemap-entries.ts"), /"\/how-we-verify"/);
});
