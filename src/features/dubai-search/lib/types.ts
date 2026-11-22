export type SourceId = "sample-portal-a" | "sample-portal-b" | "sample-portal-c" | "sample-agency" | "user-url" | "user-csv";

export type Purpose = "buy" | "rent";
export type PropertyType = "apartment" | "villa" | "townhouse" | "penthouse" | "other";
export type Completion = "ready" | "off-plan";

/** One advertisement, as found at one source. Never a Developer Connects listing. */
export interface Listing {
  id: string;
  source: SourceId;
  /** Shown instead of the source's name when the source is user-supplied (for example the website's host name). */
  sourceLabel?: string;
  title: string;
  community: string;
  building: string | null;
  /** Unit identifier, only where the advertiser legitimately shows it. */
  unit: string | null;
  floor: number | null;
  purpose: Purpose;
  propertyType: PropertyType;
  /** 0 means studio. */
  bedrooms: number;
  bathrooms: number | null;
  areaSqft: number | null;
  priceAed: number;
  completion: Completion | null;
  furnished: boolean | null;
  /** The original advertisement. For demo records it is a placeholder that is never opened. */
  url: string;
  /** Advertising permit number exactly as the advertiser printed it. Never checked by this product. */
  permitNumber: string | null;
  discoveredAt: string;
  lastCheckedAt: string;
  availabilityNote: string | null;
  isDemo: boolean;
}

export interface SourceInfo {
  id: SourceId;
  name: string;
  kind: "demo" | "user";
  description: string;
}

export type SortKey = "relevance" | "price-asc" | "price-desc" | "size-desc" | "fresh";

export interface SearchFilters {
  query: string;
  purpose: Purpose;
  propertyTypes: PropertyType[];
  /** 0 studio, 1, 2, 3, 4 means "4 or more". Empty means any. */
  bedrooms: number[];
  minPrice: number | null;
  maxPrice: number | null;
  completion: "any" | Completion;
  furnished: "any" | "furnished" | "unfurnished";
  minArea: number | null;
  maxArea: number | null;
  /** Empty means every source. */
  sources: SourceId[];
}

export const DEFAULT_FILTERS: SearchFilters = {
  query: "Jumeirah Village Circle",
  purpose: "buy",
  propertyTypes: ["apartment"],
  bedrooms: [],
  minPrice: null,
  maxPrice: null,
  completion: "ready",
  furnished: "any",
  minArea: null,
  maxArea: null,
  sources: [],
};

export type MatchKind = "confirmed" | "probable";

export interface ListingGroup {
  id: string;
  /** "single" is one advertisement; the others are the same unit advertised more than once. */
  kind: "single" | MatchKind;
  members: Listing[];
  /** Plain-language reasons the members were grouped. */
  reasons: string[];
  minPrice: number;
  maxPrice: number;
}
