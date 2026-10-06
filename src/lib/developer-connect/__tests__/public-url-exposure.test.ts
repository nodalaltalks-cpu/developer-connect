import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { internalSearchDomain, toPublicDeveloperProfile } from "../public-view.ts";
import { buildDeveloperMetadataText, developerIntroText } from "../developer-page-content.ts";
import { gatePreference, gateReducer, initialGateState } from "../../leads/gate/gate-flow.ts";
import { describeTimeline } from "../../leads/timeline.ts";
import type { Developer, WebsiteCandidate } from "../types.ts";
import type { LeadEvent } from "../../leads/types.ts";

/**
 * Stage 5 guard: a buyer is never handed a developer's website. The verified
 * URL stays internal verification data (database, Founder screens). These tests
 * scan every PUBLIC source file and check the public data boundary directly, so
 * a future change that reintroduces a URL, a domain, an outbound link or the
 * old "Visit official website" wording fails here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../"); // src
const read = (relative: string) => readFileSync(path.join(srcRoot, relative), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (file: string) => path.relative(srcRoot, file).split(path.sep).join("/");

/** Every source file a buyer's browser or a public page can reach: public routes, public components, public server actions. */
function publicSources(): string[] {
  const inAdmin = (file: string) => /(^|\/)admin(\/|$)/.test(rel(file));
  return [...walk(path.join(srcRoot, "app")), ...walk(path.join(srcRoot, "components"))].filter(
    // external-domain-link.tsx is founder-only; the scan below proves nothing public imports it.
    (file) => /\.tsx?$/.test(file) && !inAdmin(file) && !rel(file).includes("__tests__") && rel(file) !== "components/external-domain-link.tsx",
  );
}

// --- the public data boundary ------------------------------------------------------------------

const developer = {
  id: "11111111-1111-4111-8111-111111111111",
  legalName: "Acme Realty Private Limited",
  displayName: "Acme Realty",
  slug: "acme-realty",
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  headquartersLocation: undefined,
  status: "ACTIVE",
} as unknown as Developer;
const verified = {
  id: "22222222-2222-4222-8222-222222222222",
  developerId: developer.id,
  url: "https://www.acme-secret-site.example/home",
  canonicalDomain: "acme-secret-site.example",
  verificationStatus: "VERIFIED",
  reviewedAt: new Date("2026-02-02T00:00:00.000Z"),
} as unknown as WebsiteCandidate;

test("boundary: the public profile proves verification but carries no URL or domain — not even through serialisation or cloning", () => {
  const profile = toPublicDeveloperProfile(developer, verified);
  assert.deepEqual(Object.keys(profile.officialWebsite ?? {}), ["verifiedAt"]);
  for (const copy of [JSON.stringify(profile), JSON.stringify(structuredClone(profile)), JSON.stringify({ ...profile })]) {
    assert.ok(!copy.includes("acme-secret-site"), "the website leaked into a serialised profile");
  }
  assert.equal(internalSearchDomain(profile), "acme-secret-site.example", "server-side search can still match the domain");
  assert.equal(internalSearchDomain(structuredClone(profile)), "", "a copy loses it — it can never ride along into a response");
});

test("boundary: an unverified developer has no website object at all", () => {
  assert.equal(toPublicDeveloperProfile(developer, null).officialWebsite, null);
});

test("seo: page title keeps its established pattern; description and intro say 'verified' without naming the site", () => {
  const profile = toPublicDeveloperProfile(developer, verified);
  const { title, description } = buildDeveloperMetadataText(profile);
  assert.equal(title, "Acme Realty Official Website in Mumbai | Developer Connects");
  assert.match(description, /has verified its official website/);
  const intro = developerIntroText(profile, () => "2 February 2026");
  assert.equal(intro, "Acme Realty is a real estate developer in Mumbai, Maharashtra, India. Acme Realty's official website has been verified by Developer Connects on 2 February 2026.");
  for (const text of [title, description, intro]) assert.doesNotMatch(text, /acme-secret-site|https?:|www\./i);
});

// --- public source scan --------------------------------------------------------------------------

test("source: no public file reads the website URL or domain", () => {
  for (const file of publicSources()) {
    const source = code(readFileSync(file, "utf8"));
    assert.doesNotMatch(source, /officialWebsite!?\??\.(url|canonicalDomain)|\bcanonicalDomain\b|websiteUrl|websiteDomain/, `${rel(file)} reads a developer website`);
  }
});

test("source: only founder code may import the external-domain link, the verified-candidate read or the search-domain helper", () => {
  const allowedForCandidates = /^(lib\/|app\/admin\/|components\/admin\/)/;
  for (const file of publicSources()) {
    const source = code(readFileSync(file, "utf8"));
    assert.doesNotMatch(source, /external-domain-link|ExternalDomainLink/, `${rel(file)} imports the outbound link component`);
    assert.doesNotMatch(source, /internalSearchDomain/, `${rel(file)} uses the server-only search domain`);
    if (!allowedForCandidates.test(rel(file))) {
      assert.doesNotMatch(source, /getVerifiedForDeveloper|candidates\.list/, `${rel(file)} reads website candidates`);
    }
  }
});

test("source: the old outbound wording and component are gone from every public file", () => {
  for (const file of publicSources()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Visit official website|Visit Official Website|VisitOfficialWebsiteButton|visit-official-website/i, `${rel(file)} still has the outbound CTA`);
    assert.doesNotMatch(code(source), /Continue to official website|new tab/i, `${rel(file)} still describes opening a developer site`);
  }
});

test("source: no public page or component hard-links to a developer's own site (every absolute href is an allowlisted Developer Connects or platform address)", () => {
  const allowedHosts = /^https?:\/\/(developerconnects\.com|wa\.me|www\.google|www\.linkedin|www\.instagram|twitter\.com|x\.com|www\.facebook|facebook\.com|www\.youtube|mail\.google|support\.google|schema\.org|clerk\.|accounts\.)/i;
  for (const file of publicSources()) {
    const source = code(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/href=\{?["'`](https?:\/\/[^"'`$]+)/g)) {
      assert.match(match[1], allowedHosts, `${rel(file)} links to ${match[1]}`);
    }
  }
});

test("source: the sitemap and llms.txt never name a developer's website", () => {
  for (const file of ["lib/sitemap-entries.ts", "app/llms.txt/route.ts"]) {
    const source = code(read(file));
    assert.doesNotMatch(source, /canonicalDomain|officialWebsite\.url|verified official website domain/, `${file} names a developer website`);
  }
  assert.match(read("app/llms.txt/route.ts"), /that its official website has been verified/);
});

test("source: server actions that return developers return the public shape only", () => {
  const actions = code(read("app/_actions/public-actions.ts"));
  assert.match(actions, /Promise<PublicDeveloperProfile\[\]>/);
  assert.doesNotMatch(actions, /WebsiteCandidate|candidates\./);
  const click = actions.slice(actions.indexOf("export async function recordOfficialWebsiteClick"), actions.indexOf("export async function recordDeveloperShare"));
  assert.doesNotMatch(click, /targetDomain|domain/i, "the click event no longer records a domain");
});

// --- the founder side keeps the website ---------------------------------------------------------

test("founder: the verified website is shown only on the founder lead page, after requireFounder", () => {
  const page = code(read("app/admin/leads/[id]/page.tsx"));
  assert.ok(page.indexOf("getVerifiedForDeveloper") > page.indexOf("await requireFounder()"));
  assert.match(page, /developerWebsite=\{developerWebsite\}/);
  assert.match(code(read("components/admin/leads/lead-detail-sections.tsx")), /Verified website/);
  // The verification screens themselves are untouched and still link to the website for the founder.
  assert.match(code(read("components/admin/candidate-url-editor.tsx")), /<ExternalDomainLink url=\{candidate\.url\}/);
});

// --- mobile admin header ------------------------------------------------------------------------

test("mobile: the admin header wraps on a phone (brand + avatar on one row, date filter on its own row) and is a single row from sm up", () => {
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /flex max-w-6xl flex-wrap items-center/);
  assert.match(layout, /px-4 py-3 sm:h-16 sm:gap-x-4 sm:px-6 sm:py-0/);
  assert.match(layout, /order-2 shrink-0 sm:order-3/, "the avatar stays on the first row on a phone");
  assert.match(layout, /order-3 flex w-full justify-end sm:order-2 sm:w-auto/, "the date filter drops to its own full-width row on a phone");
  assert.match(layout, /mr-auto flex min-w-0 items-center/);
  assert.doesNotMatch(layout, /flex h-16 max-w-6xl items-center justify-between px-6/, "the old fixed single-row header is gone");
  assert.match(layout, /px-4 py-6 sm:px-6 lg:flex-row/, "the page gutter is 16px on a phone");
});

// --- copy rules ----------------------------------------------------------------------------------

test("copy: no public page makes an unsupported commercial claim, and the payment disclosure is unchanged", () => {
  const publicCopy = publicSources().map((file) => readFileSync(file, "utf8")).join("\n") + read("lib/developer-connect/buy-direct-guides.ts") + read("lib/leads/gate/gate-copy.ts") + read("lib/leads/consent.ts");
  assert.doesNotMatch(publicCopy, /zero[- ](commission|brokerage)|no[- ]brokerage|brokerage[- ]free|commission[- ]free|free of (cost|charge) to (buyers|you)/i);
  assert.match(read("app/about/page.tsx"), /may receive payment from developers or others in connection with/);
  assert.match(read("app/faq/page.tsx"), /may receive payment from developers or others in connection with property transactions/);
  assert.match(read("app/disclaimer/page.tsx"), /receive payment from developers or others in connection with property transactions/);
});

test("copy: the pages that described the old flow no longer promise a link or a new tab", () => {
  for (const file of ["app/about/page.tsx", "app/faq/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx", "app/disclaimer/page.tsx", "app/llms.txt/route.ts"]) {
    const source = read(file).replace(/&apos;/g, "'");
    assert.doesNotMatch(source, /Visit official website|opens in a new tab|their real site opens|continue to a developer's website|click through to a|Each developer on Developer Connects links to/i, `${file} still describes the old outbound flow`);
  }
  assert.match(read("app/faq/page.tsx"), /Developer Connects does not send you to the developer's website/);
  assert.match(read("app/privacy/page.tsx").replace(/&apos;/g, "'"), /When you ask to connect with a developer through Developer Connects/);
});

// --- gate copy follows the preference that applies ----------------------------------------------

test("gate: the copy speaks about the channel that applies — the one just used, the one on file, else the form's", () => {
  const form = gateReducer(initialGateState(), { type: "LOADED_NEW" });
  assert.equal(gatePreference(form), "WHATSAPP");
  const returning = gateReducer(initialGateState(), { type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "PHONE_CALL" });
  assert.equal(gatePreference(returning), "PHONE_CALL", "a returning buyer who prefers calls is not told 'on WhatsApp'");
  const retry = gateReducer(returning, { type: "SUBMIT_START", attempt: "returning" });
  assert.equal(gatePreference(retry), "PHONE_CALL");
  const done = gateReducer(retry, { type: "SUBMIT_SUCCEEDED", maskedPhone: "+91 ••••••210", preference: "PHONE_CALL" });
  assert.equal(gatePreference(done), "PHONE_CALL");
});

// --- the founder timeline ------------------------------------------------------------------------

test("timeline: a connect request reads clearly, and the earlier-flow events are labelled honestly", () => {
  const event = (eventType: LeadEvent["eventType"], payload: Record<string, unknown>): LeadEvent => ({
    id: eventType,
    leadId: "l",
    eventType,
    actorType: "BUYER",
    actorId: null,
    developerId: null,
    fromStatus: null,
    toStatus: null,
    payload,
    createdAt: new Date("2026-10-05T10:00:00.000Z"),
  });
  const lines = describeTimeline([
    event("DEVELOPER_CONNECT_REQUESTED", { developerName: "Acme Realty" }),
    event("OFFICIAL_WEBSITE_CLICKED", { developerName: "Beta Homes" }),
    event("DEVELOPER_WEBSITE_REDIRECTED", {}),
  ]).map((line) => line.headline);
  assert.deepEqual(lines, ["Asked to connect with Acme Realty", "Opened Beta Homes's official website (earlier flow)", "Sent on to the developer's website (earlier flow)"]);
});
