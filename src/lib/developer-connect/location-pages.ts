/**
 * The approved, indexable location views of the existing /developers
 * directory — the single place their names, URLs and wording are defined.
 *
 * Only the entries below ever become location pages. Any other country or
 * city, any combination that is not listed (for example a city with no
 * country, or a city paired with the wrong country), and any other query
 * parameter is treated as "no location": /developers then behaves exactly
 * as it always has (the full directory, canonical /developers). That is how
 * arbitrary URLs are kept from turning into thin or duplicate indexable
 * pages. Adding a location later means adding a line here and nothing else.
 *
 * Pure functions with no framework imports, so they are unit-testable and
 * shared by the page, the sitemap and the footer.
 */

const DEVELOPERS_PATH = "/developers";

interface ApprovedCountry {
  /** Exact, canonically-cased value stored in developers.country. */
  name: string;
  /** How the country reads in titles ("UAE Real Estate Developers"). */
  titleName: string;
  /** How it reads inside a sentence ("developers in the UAE"). */
  phrase: string;
}

interface ApprovedCity {
  country: string;
  /** Exact, canonically-cased value stored in developers.city. */
  name: string;
}

const APPROVED_COUNTRIES: readonly ApprovedCountry[] = [
  { name: "India", titleName: "India", phrase: "India" },
  { name: "United Arab Emirates", titleName: "UAE", phrase: "the UAE" },
];

const APPROVED_CITIES: readonly ApprovedCity[] = [
  { country: "India", name: "Mumbai" },
  { country: "India", name: "Hyderabad" },
  { country: "India", name: "Pune" },
  { country: "India", name: "Navi Mumbai" },
  { country: "United Arab Emirates", name: "Dubai" },
];

/** A validated location, always with canonical casing. */
export interface LocationPage {
  country: string;
  city?: string;
  /** Used in titles: the city, or the country's short title name. */
  titleName: string;
  /** Used inside sentences: the city, or the country's phrase. */
  phrase: string;
}

type ParamValue = string | string[] | undefined;

function normalize(raw: ParamValue): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Validates the raw `country` and `city` query values. Matching ignores
 * case and extra spaces, but the result always carries canonical values, so
 * every URL variant resolves to the same canonical page.
 *
 * Returns null — meaning "not a location page" — unless:
 *  - `country` is an approved country, and
 *  - `city` is either absent or an approved city of THAT country.
 */
export function resolveLocationPage(country: ParamValue, city: ParamValue): LocationPage | null {
  const wantedCountry = normalize(country);
  if (!wantedCountry) return null;

  const matchedCountry = APPROVED_COUNTRIES.find((entry) => entry.name.toLowerCase() === wantedCountry);
  if (!matchedCountry) return null;

  const wantedCity = normalize(city);
  if (!wantedCity) {
    return { country: matchedCountry.name, titleName: matchedCountry.titleName, phrase: matchedCountry.phrase };
  }

  const matchedCity = APPROVED_CITIES.find(
    (entry) => entry.country === matchedCountry.name && entry.name.toLowerCase() === wantedCity,
  );
  if (!matchedCity) return null;

  return { country: matchedCountry.name, city: matchedCity.name, titleName: matchedCity.name, phrase: matchedCity.name };
}

/**
 * The URL of a directory page. Parameter order is always country, city,
 * page, and page 1 has no page parameter, so one page never has two
 * spellings. URLSearchParams writes spaces as "+", matching the approved
 * URL form (?country=United+Arab+Emirates).
 * With no location this is the original, unfiltered /developers URL.
 */
export function developersPath(location: Pick<LocationPage, "country" | "city"> | null, page = 1): string {
  const params = new URLSearchParams();
  if (location) {
    params.set("country", location.country);
    if (location.city) params.set("city", location.city);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${DEVELOPERS_PATH}?${query}` : DEVELOPERS_PATH;
}

/** The canonical URL (page 1) of a location. */
export function locationPath(location: Pick<LocationPage, "country" | "city">): string {
  return developersPath(location, 1);
}

export interface LocationMetadataText {
  title: string;
  description: string;
  h1: string;
}

/** Title, description and H1 for a location page; page 2+ gets a natural " – Page N" suffix on the title. */
export function locationMetadataText(location: LocationPage, page = 1): LocationMetadataText {
  const baseTitle = `${location.titleName} Real Estate Developers – Verified Official Websites | Developer Connects`;
  return {
    title: page > 1 ? `${baseTitle} – Page ${page}` : baseTitle,
    description: `Explore verified real estate developers in ${location.phrase} and go straight to each developer’s official website, as verified by Developer Connects.`,
    h1: `Verified real estate developers in ${location.phrase}`,
  };
}

/** The introduction line. The count is always the live total passed in — never a stored number. */
export function locationIntro(location: LocationPage, total: number): string {
  return `${total} real estate developer${total === 1 ? "" : "s"} in ${location.phrase} with an official website verified by Developer Connects.`;
}

export interface BreadcrumbItem {
  label: string;
  /** Absent on the current (last) item. */
  href?: string;
}

/** Home → Developers → country → city, using the full country name; the last item is the current page. */
export function locationBreadcrumbs(location: LocationPage): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Developers", href: DEVELOPERS_PATH },
  ];
  if (location.city) {
    items.push({ label: location.country, href: developersPath({ country: location.country }) });
    items.push({ label: location.city });
  } else {
    items.push({ label: location.country });
  }
  return items;
}

/** Every approved location, in a stable order (countries first) — used by the sitemap. */
export function approvedLocationPages(): LocationPage[] {
  const countries = APPROVED_COUNTRIES.map((entry) => resolveLocationPage(entry.name, undefined));
  const cities = APPROVED_CITIES.map((entry) => resolveLocationPage(entry.country, entry.name));
  return [...countries, ...cities].filter((entry): entry is LocationPage => entry !== null);
}
