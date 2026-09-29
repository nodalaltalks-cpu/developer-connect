import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alsoKnownAs, buildDeveloperMetadataText, serializeJsonLd } from "../developer-page-content.ts";
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
  const sitemap = read("../../../app/sitemap.ts");
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
