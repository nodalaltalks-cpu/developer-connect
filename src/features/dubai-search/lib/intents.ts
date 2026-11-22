import { COMMUNITIES, communityLabel, getCommunity, type Community } from "./communities.ts";
import { type Kind, type Purpose, supportsKind } from "./portals.ts";

/**
 * A search intent is one thing a buyer types into Google: "2 bedroom apartments for sale in JVC", "studio for rent in Dubai Marina",
 * "villas for sale on Palm Jumeirah". Each one gets its own page at /dubai-property-search/{community}/{intent}. The slug is the
 * intent, so the address says what the page is for.
 */
export interface Intent {
  slug: string;
  purpose: Purpose;
  kind: Kind;
  bedrooms: number | null;
}

const BEDROOM_SLUG: Record<number, string> = { 0: "studio-apartments", 1: "1-bedroom-apartments", 2: "2-bedroom-apartments", 3: "3-bedroom-apartments" };

export function intentSlug(purpose: Purpose, kind: Kind, bedrooms: number | null): string {
  const what = kind === "apartments" && bedrooms !== null ? BEDROOM_SLUG[bedrooms] : kind;
  return `${what}-for-${purpose === "buy" ? "sale" : "rent"}`;
}

export function parseIntent(slug: string): Intent | null {
  const m = /^(studio-apartments|[123]-bedroom-apartments|apartments|villas|townhouses)-for-(sale|rent)$/.exec(slug);
  if (!m) return null;
  const what = m[1];
  const purpose: Purpose = m[2] === "sale" ? "buy" : "rent";
  if (what === "villas" || what === "townhouses" || what === "apartments") return { slug, purpose, kind: what, bedrooms: null };
  const bedrooms = what === "studio-apartments" ? 0 : Number(what[0]);
  return { slug, purpose, kind: "apartments", bedrooms };
}

export function intentsFor(c: Community): Intent[] {
  const out: Intent[] = [];
  for (const purpose of ["buy", "rent"] as const) {
    const kinds: Kind[] = ["apartments", ...(c.villas ? (["villas"] as const) : []), ...(c.townhouses ? (["townhouses"] as const) : [])];
    for (const kind of kinds) {
      if (!supportsKind(c, kind)) continue;
      out.push({ slug: intentSlug(purpose, kind, null), purpose, kind, bedrooms: null });
      if (kind === "apartments") for (const b of [0, 1, 2, 3]) out.push({ slug: intentSlug(purpose, kind, b), purpose, kind, bedrooms: b });
    }
  }
  return out;
}

export function allPages(): Array<{ community: string; intent: string }> {
  return COMMUNITIES.flatMap((c) => intentsFor(c).map((i) => ({ community: c.id, intent: i.slug })));
}

export function intentLabel(i: Pick<Intent, "purpose" | "kind" | "bedrooms">): string {
  const what =
    i.kind === "apartments" && i.bedrooms !== null ? (i.bedrooms === 0 ? "Studio apartments" : `${i.bedrooms} bedroom apartments`) : i.kind === "apartments" ? "Apartments" : i.kind === "villas" ? "Villas" : "Townhouses";
  return `${what} for ${i.purpose === "buy" ? "sale" : "rent"}`;
}

/**
 * Only pages likely to be useful on their own are offered to search engines: every community page, every apartments / villas /
 * townhouses page, and the bedroom pages of the four most-searched communities. The remaining bedroom pages work for visitors but
 * are marked noindex until Search Console shows they earn their place, so a wall of near-identical pages cannot drag the whole site down.
 */
export function isIndexable(c: Community, i: Intent): boolean {
  return i.bedrooms === null || c.indexBedroomPages;
}

export function pagePath(communityId: string, intentSlugValue?: string): string {
  return intentSlugValue ? `/dubai-property-search/${communityId}/${intentSlugValue}` : `/dubai-property-search/${communityId}`;
}

export function pageTitle(c: Community, i: Intent): string {
  return `${intentLabel(i)} in ${communityLabel(c)}, Dubai`;
}

export function resolve(communityId: string, slug: string): { community: Community; intent: Intent } | null {
  const community = getCommunity(communityId);
  const intent = parseIntent(slug);
  if (!community || !intent || !supportsKind(community, intent.kind)) return null;
  return { community, intent };
}

/** Every address worth listing in the sitemap: the section home, the comparison tool, each community and each indexable search page. */
export function sitemapPaths(): string[] {
  const out = ["/dubai-property-search", "/dubai-property-search/compare"];
  for (const c of COMMUNITIES) {
    out.push(pagePath(c.id));
    for (const i of intentsFor(c)) if (isIndexable(c, i)) out.push(pagePath(c.id, i.slug));
  }
  return out;
}
