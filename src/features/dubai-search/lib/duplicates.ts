import type { Listing, ListingGroup, MatchKind } from "./types.ts";

/**
 * Property identity resolution: the same flat is often advertised by several agencies on several sites. This decides, pair by pair,
 * whether two advertisements are the same unit. It is deliberately cautious: anything uncertain stays separate ("similar"), and
 * advertisements are only grouped when EVERY pair inside the group agrees.
 *
 *  confirmed: same purpose, community, building, bedrooms, the same unit identifier shown by both, and the area within 2%.
 *  probable:  same purpose, community, building and bedrooms, the floor known and equal on both, area within 3%, asking prices within
 *             15%, and no sign of a different unit (a different unit number or floor rules it out).
 *  similar:   everything else. Kept separate. A listing with no floor and no unit is never grouped: stacked flats in one tower often
 *             share a layout and area, so area alone proves nothing.
 */
export type PairResult = { kind: MatchKind; reasons: string[] } | { kind: "similar"; reasons: string[] };

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const relDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);

export function classifyPair(a: Listing, b: Listing): PairResult {
  if (a.source === b.source) return { kind: "similar", reasons: ["Both are from the same source, so they are listed as separate advertisements."] };
  if (a.purpose !== b.purpose) return { kind: "similar", reasons: ["One is for sale and the other for rent."] };
  if (norm(a.community) !== norm(b.community)) return { kind: "similar", reasons: ["Different communities."] };
  if (!norm(a.building) || norm(a.building) !== norm(b.building)) return { kind: "similar", reasons: ["Not the same named building."] };
  if (a.bedrooms !== b.bedrooms) return { kind: "similar", reasons: ["Different number of bedrooms."] };

  const unitA = norm(a.unit);
  const unitB = norm(b.unit);
  if (unitA && unitB && unitA !== unitB) return { kind: "similar", reasons: ["Different unit numbers."] };
  if (a.floor !== null && b.floor !== null && a.floor !== b.floor) return { kind: "similar", reasons: ["Different floors."] };

  const areaDiff = a.areaSqft && b.areaSqft ? relDiff(a.areaSqft, b.areaSqft) : null;
  if (areaDiff === null) return { kind: "similar", reasons: ["Area missing on one advertisement, so they cannot be compared safely."] };
  if (areaDiff > 0.03) return { kind: "similar", reasons: ["Areas differ by more than 3%."] };

  const reasons = ["Same building and bedrooms."];
  if (unitA && unitA === unitB && areaDiff <= 0.02) {
    return { kind: "confirmed", reasons: [...reasons, `Both show unit ${a.unit}.`, `Areas within ${(areaDiff * 100).toFixed(1)}%.`] };
  }
  if (a.floor !== null && b.floor !== null && a.floor === b.floor && relDiff(a.priceAed, b.priceAed) <= 0.15) {
    return { kind: "probable", reasons: [...reasons, `Both on floor ${a.floor}.`, `Areas within ${(areaDiff * 100).toFixed(1)}%.`, "Asking prices within 15%."] };
  }
  return { kind: "similar", reasons: ["Not enough shared detail (floor or unit) to say it is the same unit."] };
}

/** Groups advertisements of the same unit. Input order does not matter; the result is stable. */
export function groupListings(listings: readonly Listing[]): ListingGroup[] {
  const sorted = [...listings].sort((x, y) => x.id.localeCompare(y.id));
  const groups: Array<{ members: Listing[]; kind: MatchKind | "single"; reasons: string[] }> = [];

  for (const listing of sorted) {
    let placed = false;
    for (const group of groups) {
      const results = group.members.map((m) => classifyPair(m, listing));
      if (results.every((r) => r.kind !== "similar")) {
        group.members.push(listing);
        group.kind = group.kind === "confirmed" || group.kind === "single" ? (results.every((r) => r.kind === "confirmed") ? "confirmed" : "probable") : "probable";
        group.reasons = results[0].reasons;
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ members: [listing], kind: "single", reasons: [] });
  }

  return groups.map((g) => {
    const prices = g.members.map((m) => m.priceAed);
    return { id: `g-${g.members[0].id}`, kind: g.kind, members: g.members, reasons: g.reasons, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  });
}

export const DUPLICATE_NOTICE =
  "Grouping is our best guess from the details shown. Always confirm the actual unit, the price and that it is still available with the advertiser.";
