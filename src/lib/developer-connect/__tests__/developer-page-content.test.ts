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
test("developer page no longer shows verification dates or claims", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.doesNotMatch(page, /Last verified|verifiedAt|OfficialWebsiteVerifiedBadge|how-we-verify/);
  assert.doesNotMatch(page, /updatedAt|lastCheckedAt|createdAt/);
});

test("sitemap lastmod comes only from verifiedAt and is omitted when null", () => {
  const sitemap = read("../../sitemap-entries.ts");
  assert.match(sitemap, /officialWebsite\?\.verifiedAt \? \{ lastModified: developer\.officialWebsite\.verifiedAt \} : \{\}/);
  assert.doesNotMatch(sitemap, /updatedAt|lastCheckedAt|createdAt/);
});

// D/E. P2 — metadata
test("published developer metadata states the advisory offer, with the city when present", () => {
  const { title, description } = buildDeveloperMetadataText(profile());
  assert.equal(title, "Acme Realty in Mumbai: Developer Profile | Developer Connects");
  assert.doesNotMatch(description, /acme\.example|https?:|\.com\b/, "the developer's website is never named in public metadata");
  assert.doesNotMatch(description, /verif/i, "developer verification is no longer a public claim");
  assert.match(description, /one-to-one expert guidance/);
  assert.match(description, /Mumbai/);
  assert.match(description, /Developer Connects/);
});

test("verified metadata omits the city when it is blank", () => {
  const { title, description } = buildDeveloperMetadataText(profile({ city: "  " }));
  assert.equal(title, "Acme Realty: Developer Profile | Developer Connects");
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
test("unpublished developer: plain title, not a profile page, still noindexed", () => {
  const { title, description } = buildDeveloperMetadataText(profile({}, null));
  assert.equal(title, "Acme Realty | Developer Connects");
  assert.doesNotMatch(title, /Official Website/);
  assert.match(description, /profile is being prepared/);
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
test("page shows no verification signal or badge", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.equal((page.match(/VerifiedBadge/g) ?? []).length, 0);
  assert.doesNotMatch(page, /verified by Developer Connects\./);
});

// P3 — duplicate lookups
test("developer loader is wrapped in React cache()", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /import \{ cache \} from "react"/);
  assert.match(page, /const loadDeveloper = cache\(/);
});

// CTA is the stored URL
test("the public profile carries no URL or domain, and the page renders neither", () => {
  const p = profile();
  assert.ok(!("url" in (p.officialWebsite ?? {})));
  assert.ok(!("canonicalDomain" in (p.officialWebsite ?? {})));
  assert.ok(!JSON.stringify(p).includes("acme.example"));
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.doesNotMatch(page, /officialWebsite\.url|canonicalDomain|ExternalDomainLink/);
});

// --- Visible official-website relationship sentence ------------------------
// A stub formatter keeps these independent of the runtime's time zone.
const fmt = (date: Date) => `<${date.toISOString().slice(0, 10)}>`;

test("intro: a published developer gets one factual location sentence (no verification claim)", () => {
  assert.equal(developerIntroText(profile(), fmt), "Acme Realty is a real estate developer in Mumbai, Maharashtra, India.");
});

test("intro: never names the website, whatever its domain is", () => {
  const p = profile({}, verifiedCandidate({ url: "https://www.totally-unrelated.example/", canonicalDomain: "totally-unrelated.example" }));
  const text = developerIntroText(p, fmt);
  assert.ok(!text.includes("totally-unrelated.example"));
  assert.ok(!text.includes("acme.example"));
  assert.ok(!text.includes("acme-realty"));
  assert.doesNotMatch(text, /verif/i);
});

test("intro: whether or not a review date exists, the sentence is the same (nothing is invented)", () => {
  const p = profile({}, verifiedCandidate({ reviewedAt: undefined }));
  const text = developerIntroText(p, fmt);
  assert.equal(text, "Acme Realty is a real estate developer in Mumbai, Maharashtra, India.");
  assert.doesNotMatch(text, /<\d{4}-\d{2}-\d{2}>/);
});

test("intro: an UNVERIFIED developer gets the location sentence only — never a verification claim", () => {
  const text = developerIntroText(profile({}, null), fmt);
  assert.equal(text, "Acme Realty is a real estate developer in Mumbai, Maharashtra, India.");
  assert.doesNotMatch(text, /official website|verified|Developer Connects/i);
});

test("intro: missing optional location parts are omitted rather than printed blank", () => {
  assert.equal(developerIntroText(profile({ state: "  " }), fmt), "Acme Realty is a real estate developer in Mumbai, India.");
  // No location at all: no sentence rather than an empty one.
  assert.equal(developerIntroText(profile({ city: "", state: "", country: "" }), fmt), "");
  assert.equal(developerIntroText(profile({ city: "", state: "", country: "" }, null), fmt), "");
});

test("intro: one natural statement — the developer name appears once", () => {
  const text = developerIntroText(profile(), fmt);
  assert.equal(text.match(/Acme Realty/g)?.length, 1);
});

test("page: renders the sentence from developerIntroText once, and leaves the CTA/card, share, report and related section in place", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.equal((page.match(/developerIntroText\(/g) ?? []).length, 1);
  assert.match(page, /\{introText && <p className="mt-2 text-foreground">\{introText\}<\/p>\}/);
  assert.doesNotMatch(page, /official website is|has been verified by/);
  // The primary CTA is "Connect with {developer}": it opens the Developer Connects gate and is handed neither a URL nor a domain.
  const cta = page.match(/<ConnectWithDeveloperButton[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(cta, /developerId=\{developer\.id\}/);
  assert.match(cta, /developerName=\{developer\.displayName\}/);
  assert.doesNotMatch(cta, /\burl=|\bdomain=/, "the browser is never handed a developer website");
  assert.doesNotMatch(page, /ExternalDomainLink|gateRequired|VisitOfficialWebsiteButton/);
  assert.match(page, /<ShareDeveloper /);
  assert.match(page, /<ReportInaccurateInfo /);
  assert.match(page, /Other developers in \{developer\.city\}/);
  assert.match(page, /Also known as/);
});

// --- the retired /how-we-verify page ------------------------------------------
test("how-we-verify: the page is gone, nothing links to it, and the old URL redirects permanently to About", () => {
  assert.throws(() => read("../../../app/how-we-verify/page.tsx"));
  for (const file of ["../../../app/developers/[slug]/page.tsx", "../../../app/(marketing)/page.tsx", "../../../app/about/page.tsx", "../../../components/site-footer.tsx", "../../sitemap-entries.ts"]) {
    assert.doesNotMatch(read(file), /how-we-verify/, `${file} still links to the retired page`);
  }
  assert.match(read("../../../../next.config.ts"), /source: "\/how-we-verify", destination: "\/about", permanent: true/);
});
