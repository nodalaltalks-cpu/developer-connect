import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approvedLocationPages,
  developersPath,
  locationBreadcrumbs,
  locationIntro,
  locationMetadataText,
  locationPath,
  resolveLocationPage,
} from "../location-pages.ts";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper } from "../developer-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveAndPublishCandidate } from "../verification-service.ts";
import { getPublicDirectoryPage } from "../search-service.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

const INDIA = "India";
const UAE = "United Arab Emirates";

// --- approved locations: resolution, canonical URL ---------------------------------------------

const APPROVED: Array<{ name: string; country: string; city?: string; path: string }> = [
  { name: "India", country: INDIA, path: "/developers?country=India" },
  { name: "UAE", country: UAE, path: "/developers?country=United+Arab+Emirates" },
  { name: "Mumbai", country: INDIA, city: "Mumbai", path: "/developers?country=India&city=Mumbai" },
  { name: "Hyderabad", country: INDIA, city: "Hyderabad", path: "/developers?country=India&city=Hyderabad" },
  { name: "Pune", country: INDIA, city: "Pune", path: "/developers?country=India&city=Pune" },
  { name: "Navi Mumbai", country: INDIA, city: "Navi Mumbai", path: "/developers?country=India&city=Navi+Mumbai" },
  { name: "Dubai", country: UAE, city: "Dubai", path: "/developers?country=United+Arab+Emirates&city=Dubai" },
  { name: "Bangalore", country: INDIA, city: "Bangalore", path: "/developers?country=India&city=Bangalore" },
  { name: "Gurugram", country: INDIA, city: "Gurugram", path: "/developers?country=India&city=Gurugram" },
  { name: "Thane", country: INDIA, city: "Thane", path: "/developers?country=India&city=Thane" },
  { name: "Abu Dhabi", country: UAE, city: "Abu Dhabi", path: "/developers?country=United+Arab+Emirates&city=Abu+Dhabi" },
];

for (const entry of APPROVED) {
  test(`location: ${entry.name} resolves and gets its own canonical URL (page 1 and page 2)`, () => {
    const location = resolveLocationPage(entry.country, entry.city);
    assert.ok(location, `${entry.name} should be an approved location`);
    assert.equal(location.country, entry.country);
    assert.equal(location.city, entry.city);
    assert.equal(locationPath(location), entry.path);
    assert.equal(developersPath(location, 1), entry.path);
    // Page 2 preserves the location and self-canonicalizes to its own URL.
    assert.equal(developersPath(location, 2), `${entry.path}&page=2`);
  });
}

test("location: exactly the eleven approved locations exist (Wave 1 + Wave 2), in sitemap order", () => {
  assert.deepEqual(
    approvedLocationPages().map((location) => locationPath(location)),
    APPROVED.map((entry) => entry.path),
  );
});

test("canonical: casing, spacing, parameter order and repeated values never create a second URL", () => {
  const canonical = "/developers?country=India&city=Navi+Mumbai";
  for (const [country, city] of [
    ["India", "Navi Mumbai"],
    ["india", "navi mumbai"],
    ["  INDIA ", "  Navi    Mumbai  "],
    [["India", "United Arab Emirates"], ["Navi Mumbai", "Dubai"]], // first value wins, like ?page=
  ] as Array<[string | string[], string | string[]]>) {
    const location = resolveLocationPage(country, city);
    assert.ok(location);
    assert.equal(locationPath(location), canonical);
  }
  // A country-only URL is the country page, and an empty city is the same as none.
  assert.equal(locationPath(resolveLocationPage("india", "")!), "/developers?country=India");
  assert.equal(locationPath(resolveLocationPage("united arab emirates", undefined)!), "/developers?country=United+Arab+Emirates");
});

test("canonical: the parameters are always written country, city, page — and page 1 has no page parameter", () => {
  const dubai = resolveLocationPage(UAE, "Dubai")!;
  assert.equal(developersPath(dubai, 1), "/developers?country=United+Arab+Emirates&city=Dubai");
  assert.equal(developersPath(dubai, 3), "/developers?country=United+Arab+Emirates&city=Dubai&page=3");
  const india = resolveLocationPage(INDIA, undefined)!;
  assert.equal(developersPath(india, 2), "/developers?country=India&page=2");
  assert.doesNotMatch(developersPath(india, 1), /page=/);
});

// --- unsupported locations keep today's behaviour ----------------------------------------------

test("alias: Bengaluru is the same place as Bangalore — it resolves to the single Bangalore page", () => {
  for (const city of ["Bengaluru", "bengaluru", "Bangalore", " BANGALORE "]) {
    const location = resolveLocationPage(INDIA, city);
    assert.ok(location, city);
    assert.equal(location.city, "Bangalore");
    assert.deepEqual(location.cityAliases, ["Bengaluru"]);
    assert.equal(locationPath(location), "/developers?country=India&city=Bangalore");
  }
  // Still needs its country, like every other city.
  assert.equal(resolveLocationPage(undefined, "Bengaluru"), null);
  assert.equal(resolveLocationPage(UAE, "Bangalore"), null);
});

test("unsupported: every other city, plus wrong or missing countries, are NOT enabled", () => {
  for (const [country, city] of [
    [UAE, "Sharjah"],
    [INDIA, "Kalyan"],
    [INDIA, "Vasai-Virar"],
    [INDIA, "Dubai"], // an approved city paired with the wrong country
    [UAE, "Mumbai"],
    [undefined, "Dubai"], // an approved city with no country
    [undefined, "Mumbai"],
    ["Nowhere", undefined],
    ["Nowhere", "Nothing"],
    ["", ""],
    [undefined, undefined],
  ] as Array<[string | undefined, string | undefined]>) {
    assert.equal(resolveLocationPage(country, city), null, `${country ?? "(none)"} / ${city ?? "(none)"}`);
  }
});

test("unsupported: an unsupported combination falls back to the original unfiltered directory URLs", () => {
  assert.equal(developersPath(null, 1), "/developers");
  assert.equal(developersPath(null, 2), "/developers?page=2");
  assert.equal(developersPath(resolveLocationPage(INDIA, "Kalyan"), 3), "/developers?page=3");
});

test("the approved list contains only the eleven approved values — no other city name appears in it", () => {
  const source = read("../location-pages.ts");
  assert.doesNotMatch(source, /Kalyan|Vasai|Virar|Bhayandar|Sharjah|Delhi|Chennai|Ajman|Panvel|Dombivli/i);
  assert.equal(approvedLocationPages().length, 11);
});

// --- metadata ----------------------------------------------------------------------------------

const METADATA: Array<{ country: string; city?: string; title: string; h1: string; description: string }> = [
  {
    country: INDIA,
    title: "India Real Estate Developers – Verified Official Websites | Developer Connects",
    h1: "Verified real estate developers in India",
    description:
      "Explore verified real estate developers in India and go straight to each developer’s official website, as verified by Developer Connects.",
  },
  {
    country: UAE,
    title: "UAE Real Estate Developers – Verified Official Websites | Developer Connects",
    h1: "Verified real estate developers in the UAE",
    description:
      "Explore verified real estate developers in the UAE and go straight to each developer’s official website, as verified by Developer Connects.",
  },
  ...["Mumbai", "Hyderabad", "Pune", "Navi Mumbai"].map((city) => ({
    country: INDIA,
    city,
    title: `${city} Real Estate Developers – Verified Official Websites | Developer Connects`,
    h1: `Verified real estate developers in ${city}`,
    description: `Explore verified real estate developers in ${city} and go straight to each developer’s official website, as verified by Developer Connects.`,
  })),
  {
    country: UAE,
    city: "Dubai",
    title: "Dubai Real Estate Developers – Verified Official Websites | Developer Connects",
    h1: "Verified real estate developers in Dubai",
    description:
      "Explore verified real estate developers in Dubai and go straight to each developer’s official website, as verified by Developer Connects.",
  },
];

for (const expected of METADATA) {
  test(`metadata: ${expected.city ?? expected.country} — exact title, H1 and description`, () => {
    const location = resolveLocationPage(expected.country, expected.city)!;
    const text = locationMetadataText(location);
    assert.equal(text.title, expected.title);
    assert.equal(text.h1, expected.h1);
    assert.equal(text.description, expected.description);
    // Page 2+ appends the page number naturally; the description is unchanged.
    const page2 = locationMetadataText(location, 2);
    assert.equal(page2.title, `${expected.title} – Page 2`);
    assert.equal(page2.description, expected.description);
    assert.doesNotMatch(text.description, /no brokers|no forms/i);
  });
}

// --- dynamic totals ----------------------------------------------------------------------------

test("intro: the count is always the live total passed in, with the right location and singular/plural", () => {
  const dubai = resolveLocationPage(UAE, "Dubai")!;
  const india = resolveLocationPage(INDIA, undefined)!;
  const uae = resolveLocationPage(UAE, undefined)!;
  assert.equal(locationIntro(dubai, 7), "7 real estate developers in Dubai with an official website verified by Developer Connects.");
  assert.equal(locationIntro(dubai, 8), "8 real estate developers in Dubai with an official website verified by Developer Connects.");
  assert.equal(locationIntro(dubai, 1), "1 real estate developer in Dubai with an official website verified by Developer Connects.");
  assert.equal(locationIntro(india, 42), "42 real estate developers in India with an official website verified by Developer Connects.");
  assert.equal(locationIntro(uae, 3), "3 real estate developers in the UAE with an official website verified by Developer Connects.");
});

test("no page, helper or sitemap hard-codes a developer count in code or copy", () => {
  // Comments are ignored (existing ones mention historical numbers); only real code and strings are checked.
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const files = [read("../location-pages.ts"), read("../../../app/developers/page.tsx"), read("../../sitemap-entries.ts")].map(withoutComments);
  for (const source of files) {
    for (const stored of ["896", "305", "1201", "1,201", "315", "257", "106", "82", "62"]) {
      const pattern = new RegExp(`(^|[^\\w.])${stored.replace(",", "\\,")}([^\\w]|$)`);
      assert.ok(!pattern.test(source), `found hard-coded ${stored}`);
    }
  }
});

// --- breadcrumbs -------------------------------------------------------------------------------

test("breadcrumbs: Home → Developers → country → city, matching the URLs, with the current page unlinked", () => {
  assert.deepEqual(locationBreadcrumbs(resolveLocationPage(INDIA, "Mumbai")!), [
    { label: "Home", href: "/" },
    { label: "Developers", href: "/developers" },
    { label: "India", href: "/developers?country=India" },
    { label: "Mumbai" },
  ]);
  assert.deepEqual(locationBreadcrumbs(resolveLocationPage(UAE, "Dubai")!), [
    { label: "Home", href: "/" },
    { label: "Developers", href: "/developers" },
    { label: "United Arab Emirates", href: "/developers?country=United+Arab+Emirates" },
    { label: "Dubai" },
  ]);
  assert.deepEqual(locationBreadcrumbs(resolveLocationPage(INDIA, undefined)!), [
    { label: "Home", href: "/" },
    { label: "Developers", href: "/developers" },
    { label: "India" },
  ]);
});

// --- the real directory filter, through the existing getPublicDirectoryPage ---------------------

async function publish(
  repos: ReturnType<typeof createInMemoryRepositories>,
  n: number,
  city: string,
  state: string,
  country: string,
) {
  const developer = await createDeveloper(repos.developers, {
    legalName: `Fixture Builder ${n} Private Limited`,
    displayName: `Fixture Builder ${n}`,
    city,
    state,
    country,
  });
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: `https://fixture-builder-${n}.example/`,
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  await approveAndPublishCandidate(repos, candidate.id, founder, "fixture");
}

async function buildDirectory() {
  const repos = createInMemoryRepositories();
  let n = 0;
  const add = async (count: number, city: string, state: string, country: string) => {
    for (let i = 0; i < count; i++) await publish(repos, ++n, city, state, country);
  };
  await add(3, "Mumbai", "Maharashtra", INDIA);
  await add(2, "Hyderabad", "Telangana", INDIA);
  await add(2, "Pune", "Maharashtra", INDIA);
  await add(1, "Navi Mumbai", "Maharashtra", INDIA);
  await add(1, "Bangalore", "Karnataka", INDIA);
  await add(2, "Bengaluru", "Karnataka", INDIA);
  await add(4, "Dubai", "Dubai", UAE);
  await add(2, "Abu Dhabi", "Abu Dhabi", UAE);
  return repos;
}

test("directory: each approved location returns exactly its own developers, using the existing filter", async () => {
  const repos = await buildDirectory();
  const expected: Array<[string, string | undefined, number]> = [
    [INDIA, undefined, 11], // 3 + 2 + 2 + 1 + 1 + 2
    [UAE, undefined, 6], // 4 + 2
    [INDIA, "Mumbai", 3],
    [INDIA, "Hyderabad", 2],
    [INDIA, "Pune", 2],
    [INDIA, "Navi Mumbai", 1],
    [UAE, "Dubai", 4],
    [INDIA, "Bangalore", 3], // 1 Bangalore + 2 Bengaluru, merged
    [UAE, "Abu Dhabi", 2],
  ];
  for (const [country, city, count] of expected) {
    const location = resolveLocationPage(country, city);
    assert.ok(location);
    const { developers, total } = await getPublicDirectoryPage(
      repos,
      { country: location.country, city: location.city, cityAliases: location.cityAliases },
      0,
      100,
    );
    assert.equal(total, count, `${city ?? country} total`);
    assert.equal(developers.length, count);
    for (const developer of developers) {
      assert.equal(developer.country, location.country);
      if (location.city) assert.ok([location.city, ...(location.cityAliases ?? [])].includes(developer.city));
    }
  }
});

test("directory: the totals are live — adding a developer changes the number, and the intro follows it", async () => {
  const repos = await buildDirectory();
  const dubai = resolveLocationPage(UAE, "Dubai")!;
  const before = await getPublicDirectoryPage(repos, { country: dubai.country, city: dubai.city }, 0, 100);
  await publish(repos, 999, "Dubai", "Dubai", UAE);
  const after = await getPublicDirectoryPage(repos, { country: dubai.country, city: dubai.city }, 0, 100);
  assert.equal(after.total, before.total + 1);
  assert.notEqual(locationIntro(dubai, before.total), locationIntro(dubai, after.total));
});

test("directory: the Bengaluru alias never leaks into other cities, and country totals are unchanged", async () => {
  const repos = await buildDirectory();
  const mumbai = await getPublicDirectoryPage(repos, { country: INDIA, city: "Mumbai", cityAliases: undefined }, 0, 100);
  assert.equal(mumbai.total, 3);
  // An alias with no city is ignored rather than widening the listing.
  const aliasOnly = await getPublicDirectoryPage(repos, { country: INDIA, cityAliases: ["Bengaluru"] }, 0, 100);
  assert.equal(aliasOnly.total, 11);
  const india = await getPublicDirectoryPage(repos, { country: INDIA }, 0, 100);
  const uae = await getPublicDirectoryPage(repos, { country: UAE }, 0, 100);
  assert.equal(india.total, 11);
  assert.equal(uae.total, 6);
});

test("directory: unfiltered /developers behaviour is unchanged (an empty filter returns every developer)", async () => {
  const repos = await buildDirectory();
  const all = await getPublicDirectoryPage(repos, {}, 0, 100);
  assert.equal(all.total, 17);
  const explicitEmpty = await getPublicDirectoryPage(repos, { country: undefined, city: undefined }, 0, 100);
  assert.equal(explicitEmpty.total, all.total);
});

// --- the page, sitemap and footer are wired to the helper (source checks; the page needs the @/ alias) ---

test("page: uses the helper for validation, canonical, titles, breadcrumbs and pagination", () => {
  const page = read("../../../app/developers/page.tsx");
  assert.match(page, /resolveLocationPage\(resolvedSearchParams\.country, resolvedSearchParams\.city\)/);
  assert.match(page, /getPublicDirectoryPage\(repos, \{ country, city, cityAliases: aliases \}/);
  assert.match(page, /alternates: \{ canonical \}/);
  assert.match(page, /const canonical = developersPath\(location, page\);/);
  assert.match(page, /locationMetadataText\(location, page\)/);
  assert.match(page, /locationBreadcrumbs\(location\)/);
  assert.match(page, /locationIntro\(location, total\)/);
  // Pagination preserves the location in both directions.
  assert.match(page, /href=\{developersPath\(location, page - 1\)\}/);
  assert.match(page, /href=\{developersPath\(location, page \+ 1\)\}/);
  assert.doesNotMatch(page, /`\/developers\?page=/);
});

test("page: no other query parameter can influence what is listed or indexed", () => {
  const page = read("../../../app/developers/page.tsx");
  assert.doesNotMatch(page, /resolvedSearchParams\.(q|query|state|search|utm)/);
  // The only structured data is the BreadcrumbList mirroring the visible breadcrumb.
  assert.equal((page.match(/application\/ld\+json/g) ?? []).length, 1);
  assert.match(page, /breadcrumbStructuredData\(/);
  // Only country and city ever reach the directory filter.
  assert.equal((page.match(/resolvedSearchParams\.\w+/g) ?? []).filter((usage, index, all) => all.indexOf(usage) === index).sort().join(","),
    "resolvedSearchParams.city,resolvedSearchParams.country,resolvedSearchParams.page");
});

test("page: an approved location with no results is kept out of the index; unsupported URLs keep the original metadata", () => {
  const page = read("../../../app/developers/page.tsx");
  assert.match(page, /total === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}/);
  assert.match(page, /const TITLE = "All verified developers \| Developer Connects";/);
  assert.match(page, /const canonical = developersPath\(null, page\);/);
  assert.match(page, /"All verified developers"/);
});

test("page: developer links stay plain crawlable links and the listing UI is unchanged", () => {
  const page = read("../../../app/developers/page.tsx");
  assert.match(page, /<Link\s+href=\{`\/developers\/\$\{developer\.slug\}`\}/);
  assert.match(page, /groupByFirstLetter\(developers\)/);
  assert.match(page, /if \(page > totalPages\) \{\s*notFound\(\);/);
});

test("sitemap: lists only the approved locations (page 1) from the single approved list", () => {
  const sitemap = read("../../sitemap-entries.ts");
  assert.match(sitemap, /approvedLocationPages\(\)\.map\(\(location\) => \(\{/);
  assert.match(sitemap, /url: `\$\{BASE_URL\}\$\{locationPath\(location\)\}`/);
  assert.match(sitemap, /\[\.\.\.staticEntries, \.\.\.locationEntries, \.\.\.guideEntries, \.\.\.developerEntries\]/);
});

test("footer: the country links point at the approved country pages and fall back to the old filter otherwise", () => {
  const footer = read("../../../components/site-footer.tsx");
  assert.match(footer, /resolveLocationPage\(country\.name, undefined\)/);
  assert.match(footer, /approved \? locationPath\(approved\) : `\/\?country=\$\{encodeURIComponent\(country\.name\)\}`/);
  // No city links were added to the footer.
  assert.doesNotMatch(footer, /city=/);
  // The approved country URLs the footer will emit:
  assert.equal(locationPath(resolveLocationPage(INDIA, undefined)!), "/developers?country=India");
  assert.equal(locationPath(resolveLocationPage(UAE, undefined)!), "/developers?country=United+Arab+Emirates");
});
