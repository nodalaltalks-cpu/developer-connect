import type { Listing } from "./types.ts";

export function aed(value: number): string {
  return `AED ${Math.round(value).toLocaleString("en-US")}`;
}

export function bedroomsLabel(beds: number): string {
  return beds === 0 ? "Studio" : `${beds} bed`;
}

export function pricePerSqft(listing: Listing): number | null {
  return listing.areaSqft ? Math.round(listing.priceAed / listing.areaSqft) : null;
}

export function priceGapLabel(min: number, max: number): string | null {
  if (max <= min) return null;
  const pct = ((max - min) / min) * 100;
  return `${aed(max - min)} apart (${pct.toFixed(1)}%) across these advertisements`;
}
