import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listRelatedVerifiedDevelopers, RELATED_DEVELOPERS_LIMIT } from "../search-service.ts";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper } from "../developer-service.ts";
import { submitWebsiteCandidate } from "../candidate-service.ts";
import { approveAndPublishCandidate, markNeedsReverification } from "../verification-service.ts";
import type { DeveloperConnectRepositories, PublishedDeveloperEntry } from "../repository.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };

// --- a stub directory with fixed ids, so results are reproducible ------------------------------

const NOW = new Date("2026-01-01T00:00:00Z");

function entry(index: number, city: string, country: string): PublishedDeveloperEntry {
  const id = `dev-${String(index).padStart(4, "0")}`;
  return {
    developer: {
      id,
      legalName: null,
      displayName: `Builder ${String(index).padStart(4, "0")}`,
      slug: `builder-${index}`,
      city,
      state: "State",
      country,
      status: "ACTIVE",
      pendingChanges: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    verifiedCandidate: {
      id: `cand-${index}`,
      developerId: id,
      url: `https://builder-${index}.example/`,
      canonicalDomain: `builder-${index}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      verificationStatus: "VERIFIED",
      confidenceScore: 0,
      reviewedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

interface Call {
  filter: { country?: string; city?: string };
  page: { limit: number; offset: number };
}

/** Only the one repository method the selection uses; it records every read so query cost can be asserted. */
function stubRepos(all: PublishedDeveloperEntry[], calls: Call[]): DeveloperConnectRepositories {
  return {
    developers: {
      async listPublishedPage(filter: Call["filter"], page: Call["page"]) {
        calls.push({ filter, page });
        const matching = all
          .filter(
            (e) =>
              (!filter.country || e.developer.country.toLowerCase() === filter.country.toLowerCase()) &&
              (!filter.city || e.developer.city.toLowerCase() === filter.city.toLowerCase()),
          )
          .sort((a, b) => a.developer.displayName.localeCompare(b.developer.displayName) || a.developer.id.localeCompare(b.developer.id));
        return { entries: matching.slice(page.offset, page.offset + page.limit), total: matching.length };
      },
    },
  } as unknown as DeveloperConnectRepositories;
}

/** `cityCount` developers in Mumbai plus `otherCount` in Pune, all India. */
function indiaDirectory(cityCount: number, otherCount = 50) {
  const all: PublishedDeveloperEntry[] = [];
  for (let i = 0; i < cityCount; i++) all.push(entry(i, "Mumbai", "India"));
  for (let i = cityCount; i < cityCount + otherCount; i++) all.push(entry(i, "Pune", "India"));
  return all;
}

const selfOf = (all: PublishedDeveloperEntry[], index: number) => all[index].developer;

// --- same city first, never itself, at most 8 ---------------------------------------------------

test("related: same city first, never the developer itself, at most 8", async () => {
  const all = indiaDirectory(40);
  const repos = stubRepos(all, []);
  for (const index of [0, 1, 17, 39]) {
    const self = selfOf(all, index);
    const related = await listRelatedVerifiedDevelopers(repos, self);
    assert.equal(related.length, RELATED_DEVELOPERS_LIMIT);
    assert.equal(RELATED_DEVELOPERS_LIMIT, 8);
    assert.ok(related.every((r) => r.id !== self.id), "never itself");
    assert.ok(related.every((r) => r.city === "Mumbai"), "a big city fills every slot from the same city");
    assert.equal(new Set(related.map((r) => r.id)).size, related.length, "no duplicates");
  }
});

// --- deterministic ------------------------------------------------------------------------------

test("related: the same developer always gets the same links, in the same order", async () => {
  const all = indiaDirectory(40);
  const repos = stubRepos(all, []);
  const self = selfOf(all, 12);
  const first = (await listRelatedVerifiedDevelopers(repos, self)).map((r) => r.id);
  const second = (await listRelatedVerifiedDevelopers(repos, self)).map((r) => r.id);
  const third = (await listRelatedVerifiedDevelopers(stubRepos(all, []), self)).map((r) => r.id);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});

// --- spread: not the same alphabetical head for everyone ----------------------------------------

for (const cityCount of [24, 40, 82, 315]) {
  test(`related: links are spread across a city of ${cityCount} developers — everyone is linked from others, lists differ`, async () => {
    const all = indiaDirectory(cityCount);
    const repos = stubRepos(all, []);
    const inbound = new Map<string, number>();
    const signatures = new Set<string>();
    let identicalToAlphabeticalHead = 0;
    const alphabetical = all.slice(0, cityCount); // fixture ids sort in display-name order

    for (let i = 0; i < cityCount; i++) {
      const self = selfOf(all, i);
      const related = await listRelatedVerifiedDevelopers(repos, self);
      const ids = related.map((r) => r.id);
      signatures.add(ids.join(","));
      for (const id of ids) inbound.set(id, (inbound.get(id) ?? 0) + 1);
      const head = alphabetical.filter((e) => e.developer.id !== self.id).slice(0, 8).map((e) => e.developer.id);
      if (ids.join(",") === head.join(",")) identicalToAlphabeticalHead++;
    }

    const counts = alphabetical.map((e) => inbound.get(e.developer.id) ?? 0);
    // The old "first 8 alphabetically" logic linked only 8 developers in the whole city.
    assert.equal(counts.filter((c) => c > 0).length, cityCount, "every developer in the city is linked from at least one other page");
    assert.ok(Math.min(...counts) >= 1);
    assert.ok(signatures.size >= cityCount / 2, `expected many different lists, got ${signatures.size}`);
    assert.ok(identicalToAlphabeticalHead <= Math.ceil(cityCount * 0.02), "almost no page should just show the alphabetical head");
  });
}

test("related: the window wraps around the end of the list without duplicates or gaps", async () => {
  const all = indiaDirectory(30);
  const calls: Call[] = [];
  const repos = stubRepos(all, calls);
  let wrapped = 0;
  for (let i = 0; i < 30; i++) {
    calls.length = 0;
    const related = await listRelatedVerifiedDevelopers(repos, selfOf(all, i));
    assert.equal(related.length, 8);
    assert.equal(new Set(related.map((r) => r.id)).size, 8);
    // A wrap-around is detectable as a window read that starts near the end of the city list.
    if (calls.some((c) => c.page.offset > 30 - 9)) wrapped++;
  }
  assert.ok(wrapped > 0, "the fixture should include developers whose window wraps");
});

// --- same country second ------------------------------------------------------------------------

test("related: a small city is topped up from the same country — city developers first, no duplicates, none from abroad", async () => {
  const all = [
    ...[0, 1, 2].map((i) => entry(i, "Mumbai", "India")), // self + 2 others in the city
    ...Array.from({ length: 30 }, (_, i) => entry(100 + i, "Pune", "India")),
    ...Array.from({ length: 30 }, (_, i) => entry(200 + i, "Dubai", "United Arab Emirates")),
  ];
  const repos = stubRepos(all, []);
  const self = selfOf(all, 0);
  const related = await listRelatedVerifiedDevelopers(repos, self);

  assert.equal(related.length, 8);
  assert.deepEqual(related.slice(0, 2).map((r) => r.id), ["dev-0001", "dev-0002"], "the two same-city developers come first");
  assert.ok(related.slice(2).every((r) => r.city === "Pune" && r.country === "India"), "the rest come from the same country");
  assert.ok(related.every((r) => r.country === "India"), "nothing from another country");
  assert.ok(related.every((r) => r.id !== self.id));
  assert.equal(new Set(related.map((r) => r.id)).size, 8);
});

test("related: a developer alone in its city gets 8 from the same country, spread differently per developer", async () => {
  const all = [
    entry(0, "Chennai", "India"),
    entry(1, "Karjat", "India"),
    ...Array.from({ length: 60 }, (_, i) => entry(100 + i, "Mumbai", "India")),
  ];
  const repos = stubRepos(all, []);
  const a = (await listRelatedVerifiedDevelopers(repos, selfOf(all, 0))).map((r) => r.id);
  const b = (await listRelatedVerifiedDevelopers(repos, selfOf(all, 1))).map((r) => r.id);
  assert.equal(a.length, 8);
  assert.equal(b.length, 8);
  assert.ok(!a.includes("dev-0000"));
  assert.notDeepEqual(a, b, "different developers should not get an identical list");
});

test("related: if fewer than 8 others exist, all of them are shown; if none, nothing", async () => {
  const few = [entry(0, "Mumbai", "India"), entry(1, "Mumbai", "India"), entry(2, "Pune", "India"), entry(3, "Pune", "India")];
  const related = await listRelatedVerifiedDevelopers(stubRepos(few, []), selfOf(few, 0));
  assert.deepEqual(related.map((r) => r.id).sort(), ["dev-0001", "dev-0002", "dev-0003"]);

  const alone = [entry(0, "Mumbai", "India")];
  assert.deepEqual(await listRelatedVerifiedDevelopers(stubRepos(alone, []), selfOf(alone, 0)), []);
});

test("related: a limit other than 8 is respected", async () => {
  const all = indiaDirectory(40);
  const related = await listRelatedVerifiedDevelopers(stubRepos(all, []), selfOf(all, 5), 6);
  assert.equal(related.length, 6);
});

// --- performance: never the whole directory -----------------------------------------------------

test("related: query cost is small and bounded — never a fetch of the whole directory", async () => {
  const all = [...indiaDirectory(315, 400), ...Array.from({ length: 300 }, (_, i) => entry(2000 + i, "Dubai", "United Arab Emirates"))];
  // A large city: at most two small reads.
  for (const index of [0, 1, 100, 314]) {
    const calls: Call[] = [];
    await listRelatedVerifiedDevelopers(stubRepos(all, calls), selfOf(all, index));
    assert.ok(calls.length <= 2, `large city used ${calls.length} reads`);
    assert.ok(calls.every((c) => c.page.limit <= RELATED_DEVELOPERS_LIMIT + 1));
  }
  // A small city topped up from its country: still a handful of small reads.
  const small = [entry(0, "Chennai", "India"), ...Array.from({ length: 500 }, (_, i) => entry(100 + i, "Mumbai", "India"))];
  for (const index of [0]) {
    const calls: Call[] = [];
    await listRelatedVerifiedDevelopers(stubRepos(small, calls), selfOf(small, index));
    assert.ok(calls.length <= 4, `small city used ${calls.length} reads`);
    assert.ok(calls.every((c) => c.page.limit <= 2 * RELATED_DEVELOPERS_LIMIT + 1), "no read larger than a couple of dozen rows");
  }
  // A city too small to fill the list reads it whole (one read), then tops up from the country (one more).
  const tiny = indiaDirectory(5, 0);
  const calls: Call[] = [];
  await listRelatedVerifiedDevelopers(stubRepos(tiny, calls), selfOf(tiny, 0));
  assert.equal(calls.length, 2);
});

// --- verified only, through the real in-memory repository ---------------------------------------

async function createAndMaybeVerify(
  repos: ReturnType<typeof createInMemoryRepositories>,
  n: number,
  outcome: "verified" | "discovered" | "needs-reverification",
) {
  const developer = await createDeveloper(repos.developers, {
    legalName: `Related Fixture ${n} Private Limited`,
    displayName: `Related Fixture ${n}`,
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  const candidate = await submitWebsiteCandidate(repos, {
    developerId: developer.id,
    url: `https://related-fixture-${n}.example/`,
    discoverySource: "MANUAL_SUBMISSION",
    actor: founder,
  });
  if (outcome !== "discovered") await approveAndPublishCandidate(repos, candidate.id, founder, "fixture");
  if (outcome === "needs-reverification") await markNeedsReverification(repos, candidate.id, founder, "flagged");
  return developer;
}

test("related: only VERIFIED developers appear — discovered and needs-re-verification ones never do", async () => {
  const repos = createInMemoryRepositories();
  const self = await createAndMaybeVerify(repos, 1, "verified");
  const verifiedNeighbor = await createAndMaybeVerify(repos, 2, "verified");
  await createAndMaybeVerify(repos, 3, "discovered");
  await createAndMaybeVerify(repos, 4, "needs-reverification");

  const related = await listRelatedVerifiedDevelopers(repos, self);
  assert.deepEqual(related.map((r) => r.id), [verifiedNeighbor.id]);
});

// --- the developer page: same design, crawlable links, real display names -----------------------

test("developer page: uses the new selection, keeps the section's design, links with plain <Link> to /developers/[slug] using the display name", () => {
  const page = read("../../../app/developers/[slug]/page.tsx");
  assert.match(page, /listRelatedVerifiedDevelopers\(createPostgresRepositories\(\), developer\)/);
  assert.doesNotMatch(page, /listOtherVerifiedDevelopersInCity/);
  // Same section markup and classes as before.
  assert.match(page, /<div className="mx-auto mt-16 max-w-2xl border-t border-border pt-10">/);
  assert.match(page, /<h2 className="text-lg font-semibold text-foreground">/);
  assert.match(page, /<ul className="mt-4 grid gap-3 sm:grid-cols-2">/);
  assert.match(page, /<Link\s+href=\{`\/developers\/\$\{other\.slug\}`\}\s+className="block truncate text-foreground hover:text-accent-hover hover:underline"\s*>\s*\{other\.displayName\}\s*<\/Link>/);
  // The related list shows the city under each name — never the developer's website domain.
  assert.match(page, /\{other\.city\}/);
  assert.doesNotMatch(page, /canonicalDomain/);
  // The heading keeps its original text when every link is in the city, and says the country otherwise.
  assert.match(page, /Other verified developers in \{developer\.city\}/);
  assert.match(page, /Other verified developers in \{developer\.country\}/);
  // Nothing keyword-stuffed: no extra anchor text or attributes on those links.
  assert.doesNotMatch(page, /\{other\.displayName\} (Official|official|Website|website)/);
});

test("the old repeated 'first 8 alphabetically' function is gone", () => {
  const service = read("../search-service.ts");
  assert.doesNotMatch(service, /listOtherVerifiedDevelopersInCity/);
  assert.match(service, /export async function listRelatedVerifiedDevelopers/);
});
