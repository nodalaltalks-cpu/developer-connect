/**
 * Mechanism for excluding known non-official domains (property portals,
 * aggregators, brokers, social platforms) from ever being treated as a
 * developer's official website — regardless of ranking, name match, or
 * apparent professionalism.
 *
 * This list is intentionally small. It exists to be grown over time (by a
 * founder, or later by an automated research agent flagging candidates
 * for review), not to be a comprehensive registry populated up front.
 */

export type DenylistCategory =
  | "PROPERTY_PORTAL"
  | "BROKER_OR_AGENT"
  | "AGGREGATOR"
  | "LISTING_SITE"
  | "SOCIAL_MEDIA"
  | "OTHER";

export interface DenylistEntry {
  /** Canonical domain, e.g. "99acres.com" (no "www.", no path). */
  domain: string;
  category: DenylistCategory;
  note?: string;
}

const DENYLIST: readonly DenylistEntry[] = [
  { domain: "99acres.com", category: "PROPERTY_PORTAL" },
  { domain: "magicbricks.com", category: "PROPERTY_PORTAL" },
  { domain: "housing.com", category: "PROPERTY_PORTAL" },
  { domain: "squareyards.com", category: "PROPERTY_PORTAL" },
  { domain: "nobroker.in", category: "AGGREGATOR" },
];

const SOCIAL_MEDIA_DOMAINS: ReadonlySet<string> = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
]);

export function findDenylistEntry(canonicalDomain: string): DenylistEntry | undefined {
  return DENYLIST.find((entry) => entry.domain === canonicalDomain);
}

export function isSocialMediaDomain(canonicalDomain: string): boolean {
  return SOCIAL_MEDIA_DOMAINS.has(canonicalDomain);
}

/** True if a domain must never be allowed to reach founder review as a candidate official website. */
export function isDisqualifyingDomain(canonicalDomain: string): boolean {
  return Boolean(findDenylistEntry(canonicalDomain)) || isSocialMediaDomain(canonicalDomain);
}
