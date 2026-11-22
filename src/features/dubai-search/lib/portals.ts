import type { Community } from "./communities.ts";

/**
 * "Search once, see every portal." Each button opens that portal's OWN search results page for the same search, in a new tab. We
 * do not copy, store or republish anyone's listings: the buyer sees the portal's current, real results on the portal itself.
 *
 * The link patterns below were verified by opening real pages on Bayut and Property Finder on 2026-11-22 (each slug returned its
 * own results page, and a made-up place did not). dubizzle blocked its pages from loading in the verification browser, so no
 * location link could be verified: its button opens the Dubai category page and the buyer picks the area there. Portals can change
 * their addresses at any time; if a link ever stops working, only this file needs updating.
 */
export type Purpose = "buy" | "rent";
export type Kind = "apartments" | "villas" | "townhouses";

export interface PortalQuery {
  community: Community;
  purpose: Purpose;
  kind: Kind;
  /** 0 is a studio, 1 to 3 are bedrooms, null is any. Only apartments have bedroom pages. */
  bedrooms: number | null;
}

export interface PortalLink {
  id: "bayut" | "property-finder" | "dubizzle";
  name: string;
  url: string;
  /** What the button does, in plain words. */
  detail: string;
}

export const BEDROOM_OPTIONS = [null, 0, 1, 2, 3] as const;

function bedroomWord(bedrooms: number | null): string {
  if (bedrooms === null) return "";
  return bedrooms === 0 ? "studio-" : `${bedrooms}-bedroom-`;
}

export function supportsKind(c: Community, kind: Kind): boolean {
  return kind === "apartments" || (kind === "villas" && c.villas) || (kind === "townhouses" && c.townhouses);
}

/** Bedroom pages exist for apartments only. */
function normalise(q: PortalQuery): PortalQuery {
  return { ...q, bedrooms: q.kind === "apartments" ? q.bedrooms : null };
}

export function bayutUrl(input: PortalQuery): string {
  const q = normalise(input);
  const path = q.purpose === "buy" ? "for-sale" : "to-rent";
  return `https://www.bayut.com/${path}/${bedroomWord(q.bedrooms)}${q.kind}/dubai/${q.community.bayutSlug}/`;
}

export function propertyFinderUrl(input: PortalQuery): string {
  const q = normalise(input);
  const section = q.purpose === "buy" ? "buy" : "rent";
  const word = q.purpose === "buy" ? "for-sale" : "for-rent";
  return `https://www.propertyfinder.ae/en/${section}/dubai/${bedroomWord(q.bedrooms)}${q.kind}-${word}-${q.community.propertyFinderSlug}.html`;
}

/** dubizzle: its Dubai apartments page for apartments, and its general Dubai property page for villas and townhouses (a villa page address could not be verified). */
export function dubizzleUrl(q: Pick<PortalQuery, "purpose" | "kind">): string {
  const section = q.purpose === "buy" ? "property-for-sale" : "property-for-rent";
  return q.kind === "apartments" ? `https://dubai.dubizzle.com/${section}/residential/apartmentflat/` : `https://dubai.dubizzle.com/${section}/`;
}

export function portalLinks(query: PortalQuery): PortalLink[] {
  const q = normalise(query);
  const place = q.community.name;
  return [
    { id: "bayut", name: "Bayut", url: bayutUrl(q), detail: `Opens Bayut's results for ${place}` },
    { id: "property-finder", name: "Property Finder", url: propertyFinderUrl(q), detail: `Opens Property Finder's results for ${place}` },
    { id: "dubizzle", name: "dubizzle", url: dubizzleUrl(q), detail: q.kind === "apartments" ? `Opens dubizzle's Dubai apartments page. Choose ${place} in its location filter` : `Opens dubizzle's Dubai property page. Choose ${q.kind} and ${place} in its filters` },
  ];
}

/** Rental prices on these portals are quoted per year. */
export const PORTAL_NOTICE =
  "These buttons open each website's own results in a new tab. Developer Connects is not affiliated with Bayut, Property Finder or dubizzle, does not copy their listings and earns nothing from your clicks. Prices, availability and photos are theirs: confirm everything with the advertiser.";
