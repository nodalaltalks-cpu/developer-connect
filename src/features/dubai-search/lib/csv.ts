import type { Completion, Listing, Purpose, PropertyType } from "./types.ts";

/**
 * Two ways to add advertisements without any paid feed or scraping: a link you add by hand (you type what it says; we never fetch
 * the page), and a CSV file of listings you are authorised to use (for example one an agency shared with you).
 */
export const MAX_CSV_BYTES = 200_000;
export const MAX_CSV_ROWS = 500;

export const CSV_COLUMNS = {
  required: ["title", "community", "purpose", "property_type", "bedrooms", "price_aed", "url"],
  optional: ["building", "unit", "floor", "bathrooms", "area_sqft", "completion", "furnished", "permit_number", "source_name"],
} as const;

export const CSV_EXAMPLE =
  "title,community,building,unit,floor,purpose,property_type,bedrooms,bathrooms,area_sqft,price_aed,completion,furnished,permit_number,source_name,url\n" +
  "2-bedroom apartment,Jumeirah Village Circle,Example Tower,1204,12,buy,apartment,2,2,1180,1350000,ready,no,,Example Agency,https://example.com/listing/123\n";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const PURPOSES: Purpose[] = ["buy", "rent"];
const TYPES: PropertyType[] = ["apartment", "villa", "townhouse", "penthouse", "other"];

function clean(s: string | undefined, max: number): string {
  // Plain text only: React escapes it, and we also strip control characters and cap the length.
  return (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function num(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : Number.NaN;
}

export function safeHttpUrl(value: string): string | null {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "your link";
  }
}

export interface ManualInput {
  url: string;
  title: string;
  community: string;
  building: string;
  unit: string;
  floor: string;
  purpose: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  areaSqft: string;
  priceAed: string;
  completion: string;
  furnished: string;
  permitNumber: string;
}

export type BuildResult = { ok: true; listing: Listing } | { ok: false; error: string };

/** Builds one listing from typed or imported fields. `idSeed` makes ids stable and unique. */
export function buildUserListing(input: ManualInput, source: "user-url" | "user-csv", sourceLabel: string | undefined, idSeed: string, nowIso: string): BuildResult {
  const url = safeHttpUrl(input.url);
  if (!url) return { ok: false, error: "The link must start with http:// or https://." };
  const title = clean(input.title, 140);
  if (!title) return { ok: false, error: "Add a title." };
  const community = clean(input.community, 80);
  if (!community) return { ok: false, error: "Add the community." };
  const purpose = input.purpose.trim().toLowerCase() as Purpose;
  if (!PURPOSES.includes(purpose)) return { ok: false, error: "Purpose must be buy or rent." };
  const type = (input.propertyType.trim().toLowerCase() || "apartment") as PropertyType;
  if (!TYPES.includes(type)) return { ok: false, error: "Property type must be apartment, villa, townhouse, penthouse or other." };
  const bedrooms = input.bedrooms.trim().toLowerCase() === "studio" ? 0 : num(input.bedrooms);
  if (bedrooms === null || Number.isNaN(bedrooms) || bedrooms > 20) return { ok: false, error: "Bedrooms must be a number (0 for studio)." };
  const price = num(input.priceAed);
  if (price === null || Number.isNaN(price) || price <= 0) return { ok: false, error: "Price in AED must be a number above zero." };
  const area = num(input.areaSqft);
  const floor = num(input.floor);
  const baths = num(input.bathrooms);
  if ([area, floor, baths].some((v) => v !== null && Number.isNaN(v))) return { ok: false, error: "Area, floor and bathrooms must be numbers." };
  const completion = input.completion.trim().toLowerCase();
  if (completion && completion !== "ready" && completion !== "off-plan") return { ok: false, error: "Completion must be ready or off-plan." };
  const furnished = input.furnished.trim().toLowerCase();
  return {
    ok: true,
    listing: {
      id: `${source}-${idSeed}`,
      source,
      sourceLabel: sourceLabel ? clean(sourceLabel, 60) : hostOf(url),
      title,
      community,
      building: clean(input.building, 80) || null,
      unit: clean(input.unit, 20) || null,
      floor,
      purpose,
      propertyType: type,
      bedrooms: bedrooms as number,
      bathrooms: baths,
      areaSqft: area,
      priceAed: price,
      completion: (completion || null) as Completion | null,
      furnished: ["yes", "true", "furnished"].includes(furnished) ? true : ["no", "false", "unfurnished"].includes(furnished) ? false : null,
      url,
      permitNumber: clean(input.permitNumber, 40) || null,
      discoveredAt: nowIso,
      lastCheckedAt: nowIso,
      availabilityNote: null,
      isDemo: false,
    },
  };
}

export interface CsvResult {
  listings: Listing[];
  errors: string[];
}

export function parseListingsCsv(text: string, nowIso: string): CsvResult {
  if (text.length > MAX_CSV_BYTES) return { listings: [], errors: [`The file is too large (limit ${MAX_CSV_BYTES / 1000} KB).`] };
  const rows = parseCsv(text);
  if (rows.length === 0) return { listings: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.required.filter((c) => !header.includes(c));
  if (missing.length > 0) return { listings: [], errors: [`Missing columns: ${missing.join(", ")}.`] };
  const col = (row: string[], name: string) => row[header.indexOf(name)] ?? "";
  const body = rows.slice(1);
  const errors: string[] = [];
  if (body.length > MAX_CSV_ROWS) errors.push(`Only the first ${MAX_CSV_ROWS} rows were read.`);
  const listings: Listing[] = [];
  body.slice(0, MAX_CSV_ROWS).forEach((row, i) => {
    const built = buildUserListing(
      {
        url: col(row, "url"), title: col(row, "title"), community: col(row, "community"), building: col(row, "building"), unit: col(row, "unit"),
        floor: col(row, "floor"), purpose: col(row, "purpose"), propertyType: col(row, "property_type"), bedrooms: col(row, "bedrooms"),
        bathrooms: col(row, "bathrooms"), areaSqft: col(row, "area_sqft"), priceAed: col(row, "price_aed"), completion: col(row, "completion"),
        furnished: col(row, "furnished"), permitNumber: col(row, "permit_number"),
      },
      "user-csv",
      clean(col(row, "source_name"), 60) || undefined,
      `${nowIso.slice(0, 10)}-${i + 1}`,
      nowIso,
    );
    if (built.ok) listings.push(built.listing);
    else errors.push(`Row ${i + 2}: ${built.error}`);
  });
  return { listings, errors };
}
