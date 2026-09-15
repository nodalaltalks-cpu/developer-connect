import type { DeveloperConnectRepositories, DeveloperGeoFilter } from "./repository.ts";
import { toPublicDeveloperProfile, type PublicDeveloperProfile } from "./public-view.ts";

const MAX_RESULTS = 20;

/** Trims and collapses internal whitespace so "  Lodha   Group " behaves like "Lodha Group". */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Public developer search. Only developers with a VERIFIED website
 * candidate are returned — an unverified developer is not yet something
 * Developer Connect can send a user to, so it is not a search result,
 * even if the name matches. (Its page still exists and is reachable
 * directly by slug — see getPublicDeveloperBySlug.)
 *
 * `geo`, when given (the visitor's current Country/State/City selection),
 * narrows the same underlying query — see DeveloperRepository.search —
 * so search and the geography filters refine each other instead of
 * search silently ignoring whatever location is already selected.
 */
export async function searchPublicDevelopers(
  repos: DeveloperConnectRepositories,
  rawQuery: string,
  geo?: DeveloperGeoFilter,
): Promise<PublicDeveloperProfile[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return [];

  const matches = await repos.developers.search(query, MAX_RESULTS, geo);

  const results: PublicDeveloperProfile[] = [];
  for (const developer of matches) {
    const verified = await repos.candidates.getVerifiedForDeveloper(developer.id);
    if (verified) {
      results.push(toPublicDeveloperProfile(developer, verified));
    }
  }
  return results;
}

/**
 * The full VERIFIED public profile list, with no query/geography filter
 * applied yet — shared by listVerifiedDevelopers, listPublicDirectory,
 * listPublicGeographyOptions, and getPublicHomepageData so there is
 * exactly one place that fetches it.
 *
 * One batched `getManyByIds` call, not one `getById` per candidate: at
 * 177 verified developers (this directory's real current size) firing
 * 177 concurrent individual queries measurably stressed the pooled
 * connection and produced real ECONNRESET failures loading the homepage
 * — this is the fix (see the Performance section of the task this
 * implements). Cost now scales with one round trip, not with developer
 * count.
 */
async function fetchAllVerifiedProfiles(
  repos: DeveloperConnectRepositories,
): Promise<PublicDeveloperProfile[]> {
  const verifiedCandidates = await repos.candidates.listByStatuses(["VERIFIED"]);
  if (verifiedCandidates.length === 0) return [];

  const developerIds = verifiedCandidates.map((c) => c.developerId);
  const developers = await repos.developers.getManyByIds(developerIds);
  const developerById = new Map(developers.map((d) => [d.id, d]));

  const results: PublicDeveloperProfile[] = [];
  for (const candidate of verifiedCandidates) {
    const developer = developerById.get(candidate.developerId);
    if (developer && developer.status === "ACTIVE") {
      results.push(toPublicDeveloperProfile(developer, candidate));
    }
  }
  return results;
}

export interface PublicDirectoryFilter {
  query?: string;
  country?: string;
  state?: string;
  city?: string;
}

/** Case-insensitive exact match — geography filters are "pick one of these options", not free text. */
function matchesExactly(value: string, filter: string | undefined): boolean {
  return !filter || value.toLowerCase() === filter.toLowerCase();
}

/**
 * Adds `value` to a case-insensitively deduplicated collection, keyed by
 * its lowercased form so "Mumbai" and "mumbai" (a Founder-entry
 * inconsistency, not something this reads from more than one place)
 * never appear as two separate filter options. The FIRST spelling seen
 * wins as the displayed/selectable form — deterministic given a stable
 * input order, and never rewrites what's actually stored on any
 * developer record.
 */
function addNormalized(target: Map<string, string>, value: string): void {
  const key = value.toLowerCase();
  if (!target.has(key)) target.set(key, value);
}

function sortedValues(target: Map<string, string>): string[] {
  return [...target.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Country -> State -> City options, and the "distinct markets" count for
 * the homepage stat, from one pass over the VERIFIED profile list —
 * shared by listPublicGeographyOptions and getPublicHomepageData so the
 * two can never compute this differently. Case-insensitively deduplicated
 * (see addNormalized) at this display/aggregation layer only; the
 * underlying developer rows are never rewritten.
 */
function aggregateGeography(
  all: PublicDeveloperProfile[],
  selected: { country?: string; state?: string; city?: string } = {},
): { options: PublicGeographyOptions; distinctMarkets: number } {
  const countries = new Map<string, string>();
  const states = new Map<string, string>();
  const cities = new Map<string, string>();
  const markets = new Set<string>();

  for (const developer of all) {
    addNormalized(countries, developer.country);
    markets.add(
      `${developer.country.toLowerCase()}|||${developer.state.toLowerCase()}|||${developer.city.toLowerCase()}`,
    );
    if (matchesExactly(developer.country, selected.country)) {
      addNormalized(states, developer.state);
      if (matchesExactly(developer.state, selected.state)) {
        addNormalized(cities, developer.city);
      }
    }
  }

  return {
    options: { countries: sortedValues(countries), states: sortedValues(states), cities: sortedValues(cities) },
    distinctMarkets: markets.size,
  };
}

/**
 * The public directory's default listing AND its geography-filtered/
 * search view — one function, because "no filters" is just the case
 * where every filter is absent, per the product requirement that the
 * directory shows something useful immediately without forcing the
 * visitor to configure anything first.
 *
 * Country -> State -> City is enforced by the caller passing only the
 * options listPublicGeographyOptions actually offered for the level
 * above (so this never needs to guess what a "valid" combination is);
 * matching is exact (not substring) since geography filters are select
 * boxes, not free text. `query`, if present, is matched the same way the
 * live search box does — case-insensitive partial match against name.
 *
 * Never returns a DISCOVERED/unpublished developer — every result comes
 * from fetchAllVerifiedProfiles, the same VERIFIED-only boundary as
 * search and the homepage.
 */
export async function listPublicDirectory(
  repos: DeveloperConnectRepositories,
  filter: PublicDirectoryFilter = {},
): Promise<PublicDeveloperProfile[]> {
  const all = await fetchAllVerifiedProfiles(repos);
  const query = filter.query ? normalizeSearchQuery(filter.query).toLowerCase() : "";

  const filtered = all.filter((developer) => {
    if (!matchesExactly(developer.country, filter.country)) return false;
    if (!matchesExactly(developer.state, filter.state)) return false;
    if (!matchesExactly(developer.city, filter.city)) return false;
    if (!query) return true;
    const haystack = [
      developer.displayName,
      developer.legalName,
      developer.city,
      developer.state,
      developer.country,
      developer.officialWebsite?.canonicalDomain ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  return filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export interface PublicGeographyOptions {
  countries: string[];
  /** States that actually have a verified developer within the given country (or all countries, if none is selected). */
  states: string[];
  /** Cities that actually have a verified developer within the given country+state (or wider, if not yet narrowed). */
  cities: string[];
}

/**
 * Only options that actually have at least one VERIFIED public developer
 * — never an empty option a visitor could pick and get zero results.
 * Country narrows State narrows City, so `state`/`city` are computed
 * relative to whatever the caller has already selected above them.
 */
export async function listPublicGeographyOptions(
  repos: DeveloperConnectRepositories,
  selected: { country?: string; state?: string } = {},
): Promise<PublicGeographyOptions> {
  const all = await fetchAllVerifiedProfiles(repos);
  return aggregateGeography(all, selected).options;
}

export interface PublicHomepageData {
  directory: PublicDeveloperProfile[];
  geographyOptions: PublicGeographyOptions;
  stats: { verifiedDevelopers: number; officialWebsitesVerified: number; citiesCovered: number };
}

/**
 * Everything the homepage needs — the (possibly filtered) directory
 * listing, the geography select options, and the live platform-statistics
 * numbers — from exactly one fetch of the verified-developer list, not
 * three. Every number here is real, current database state: `stats` is
 * derived from the same array the directory itself renders, never a
 * separately-cached or hardcoded count.
 */
export async function getPublicHomepageData(
  repos: DeveloperConnectRepositories,
  filter: PublicDirectoryFilter = {},
): Promise<PublicHomepageData> {
  const all = await fetchAllVerifiedProfiles(repos);
  const query = filter.query ? normalizeSearchQuery(filter.query).toLowerCase() : "";

  const directory = all
    .filter((developer) => {
      if (!matchesExactly(developer.country, filter.country)) return false;
      if (!matchesExactly(developer.state, filter.state)) return false;
      if (!matchesExactly(developer.city, filter.city)) return false;
      if (!query) return true;
      const haystack = [
        developer.displayName,
        developer.legalName,
        developer.city,
        developer.state,
        developer.country,
        developer.officialWebsite?.canonicalDomain ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const { options: geographyOptions, distinctMarkets } = aggregateGeography(all, filter);

  return {
    directory,
    geographyOptions,
    stats: {
      verifiedDevelopers: all.length,
      officialWebsitesVerified: all.filter((d) => d.officialWebsite).length,
      citiesCovered: distinctMarkets,
    },
  };
}

/**
 * Every publicly VERIFIED developer, for the homepage directory listing —
 * the exact same VERIFIED-only boundary as searchPublicDevelopers, just
 * not gated behind a query. Deliberately a separate function rather than
 * making searchPublicDevelopers("") return everything: an empty query
 * returning "no results" there is an existing, intentional guarantee (see
 * search-service.test.ts) for the live search box, which is a different
 * surface from "show the whole directory by default".
 *
 * Iterates over VERIFIED candidates (via the existing listByStatuses,
 * already used for the founder's review queue) rather than over every
 * developer — this directory's cost scales with how many developers are
 * actually shown, not with however many developer rows exist in total
 * (most of which are unverified and never rendered here).
 *
 * Ordered alphabetically by display name for a stable, predictable
 * listing — listByStatuses's own ordering (newest-verified-first) isn't
 * meaningful to a first-time visitor scanning for a name they recognize.
 *
 * Delegates to fetchAllVerifiedProfiles (one batched developer lookup,
 * not one query per candidate) — see getPublicHomepageData, which
 * superseded this as the homepage's own data source, for why that batching
 * matters at real directory size. Kept as its own function for callers
 * that want the unfiltered list without the geography/stats bookkeeping.
 */
export async function listVerifiedDevelopers(
  repos: DeveloperConnectRepositories,
): Promise<PublicDeveloperProfile[]> {
  const results = await fetchAllVerifiedProfiles(repos);
  return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Looks up a single developer for its public page. Returns null for a
 * developer that doesn't exist OR isn't ACTIVE — both cases should read
 * as "not found" to a public visitor, not be distinguished. Unlike
 * search, this deliberately returns developers with no verified website
 * too, so the page can show its own honest "not yet verified" state.
 */
export async function getPublicDeveloperBySlug(
  repos: DeveloperConnectRepositories,
  slug: string,
): Promise<PublicDeveloperProfile | null> {
  const developer = await repos.developers.getBySlug(slug);
  if (!developer || developer.status !== "ACTIVE") return null;

  const verified = await repos.candidates.getVerifiedForDeveloper(developer.id);
  return toPublicDeveloperProfile(developer, verified);
}
