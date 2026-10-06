import type { Developer, WebsiteCandidate } from "./types.ts";

/**
 * Public proof that a developer's official website has been VERIFIED — and
 * nothing more. The website's URL and domain are deliberately NOT part of
 * this type: they are internal verification data, available to the Founder
 * through the admin/verification code paths only. Because nothing public can
 * hold them, no page, server action, search response or JSON-LD block can
 * leak them, and no buyer can be handed a direct developer link.
 */
export interface PublicOfficialWebsite {
  /**
   * The Founder's approval time (`reviewedAt`) — the only authoritative
   * public verification date. Null when it isn't recorded; never
   * substituted with updatedAt/lastCheckedAt/createdAt, so nothing public
   * (page text, sitemap lastmod) can show a date that isn't real.
   */
  verifiedAt: Date | null;
}

/**
 * Everything (and only) what a public developer page may render. Internal
 * verification mechanics — evidence, confidence score, rejection history,
 * reviewer identity, and any non-verified candidate — never cross this
 * boundary.
 */
export interface PublicDeveloperProfile {
  id: string;
  legalName: string | null;
  displayName: string;
  slug: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
  officialWebsite: PublicOfficialWebsite | null;
}

/**
 * The domain of each profile's verified website, kept ONLY so server-side
 * search can still match a typed domain ("is this a real developer?").
 * A WeakMap keyed by the profile object is not an own property, so it is never
 * serialised into a page, an RSC payload or a server-action response.
 */
const searchDomains = new WeakMap<object, string>();

/** Server-only: the verified domain for ranking a search. Empty when unknown. Never render or return this. */
export function internalSearchDomain(profile: PublicDeveloperProfile): string {
  return searchDomains.get(profile) ?? "";
}

/**
 * The only function permitted to shape a developer for public rendering.
 * It refuses at runtime to expose a candidate that isn't VERIFIED, as a
 * defense-in-depth backstop against a caller passing the wrong candidate.
 */
export function toPublicDeveloperProfile(
  developer: Developer,
  verifiedCandidate: WebsiteCandidate | null,
): PublicDeveloperProfile {
  if (verifiedCandidate) {
    if (verifiedCandidate.verificationStatus !== "VERIFIED") {
      throw new Error(
        `toPublicDeveloperProfile received a candidate with status ${verifiedCandidate.verificationStatus}; refusing to expose it publicly`,
      );
    }
    if (verifiedCandidate.developerId !== developer.id) {
      throw new Error("Candidate does not belong to the given developer");
    }
  }

  const profile: PublicDeveloperProfile = {
    id: developer.id,
    legalName: developer.legalName,
    displayName: developer.displayName,
    slug: developer.slug,
    city: developer.city,
    state: developer.state,
    country: developer.country,
    headquartersLocation: developer.headquartersLocation,
    officialWebsite: verifiedCandidate ? { verifiedAt: verifiedCandidate.reviewedAt ?? null } : null,
  };
  if (verifiedCandidate) searchDomains.set(profile, verifiedCandidate.canonicalDomain);
  return profile;
}
