import type { Listing, ListingGroup, SearchFilters, SortKey } from "./types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Short names buyers type for communities.
const ALIASES: Record<string, string> = { jvc: "jumeirah village circle", marina: "dubai marina", downtown: "downtown dubai" };

function queryTokens(query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  return (ALIASES[q] ?? q).split(" ").filter(Boolean);
}

export function matchesFilters(listing: Listing, f: SearchFilters): boolean {
  if (listing.purpose !== f.purpose) return false;
  if (f.sources.length > 0 && !f.sources.includes(listing.source)) return false;
  if (f.propertyTypes.length > 0 && !f.propertyTypes.includes(listing.propertyType)) return false;
  if (f.bedrooms.length > 0 && !f.bedrooms.some((b) => (b >= 4 ? listing.bedrooms >= 4 : listing.bedrooms === b))) return false;
  if (f.minPrice !== null && listing.priceAed < f.minPrice) return false;
  if (f.maxPrice !== null && listing.priceAed > f.maxPrice) return false;
  if (f.completion !== "any" && listing.completion !== f.completion) return false;
  if (f.furnished === "furnished" && listing.furnished !== true) return false;
  if (f.furnished === "unfurnished" && listing.furnished !== false) return false;
  if (f.minArea !== null && (listing.areaSqft === null || listing.areaSqft < f.minArea)) return false;
  if (f.maxArea !== null && (listing.areaSqft === null || listing.areaSqft > f.maxArea)) return false;
  const tokens = queryTokens(f.query);
  if (tokens.length > 0) {
    const haystack = norm(`${listing.community} ${listing.building ?? ""} ${listing.title}`);
    if (!tokens.every((t) => haystack.includes(t))) return false;
  }
  return true;
}

export function filterListings(listings: readonly Listing[], f: SearchFilters): Listing[] {
  return listings.filter((l) => matchesFilters(l, f));
}

const newest = (g: ListingGroup) => Math.max(...g.members.map((m) => Date.parse(m.lastCheckedAt)));
const largest = (g: ListingGroup) => Math.max(...g.members.map((m) => m.areaSqft ?? 0));

export function sortGroups(groups: readonly ListingGroup[], sort: SortKey): ListingGroup[] {
  const out = [...groups];
  switch (sort) {
    case "price-asc":
      return out.sort((a, b) => a.minPrice - b.minPrice || a.id.localeCompare(b.id));
    case "price-desc":
      return out.sort((a, b) => b.maxPrice - a.maxPrice || a.id.localeCompare(b.id));
    case "size-desc":
      return out.sort((a, b) => largest(b) - largest(a) || a.id.localeCompare(b.id));
    case "fresh":
      return out.sort((a, b) => newest(b) - newest(a) || a.id.localeCompare(b.id));
    default:
      // Relevance: advertisements that appear in more places first (more to compare), then the freshest. Never anyone's paid rank.
      return out.sort((a, b) => b.members.length - a.members.length || newest(b) - newest(a) || a.id.localeCompare(b.id));
  }
}
