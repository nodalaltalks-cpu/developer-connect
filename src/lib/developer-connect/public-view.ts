import type { Developer, WebsiteCandidate } from "./types.ts";

export interface PublicOfficialWebsite {
  url: string;
  canonicalDomain: string;
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

  return {
    id: developer.id,
    legalName: developer.legalName,
    displayName: developer.displayName,
    slug: developer.slug,
    city: developer.city,
    state: developer.state,
    country: developer.country,
    headquartersLocation: developer.headquartersLocation,
    officialWebsite: verifiedCandidate
      ? {
          url: verifiedCandidate.url,
          canonicalDomain: verifiedCandidate.canonicalDomain,
          verifiedAt: verifiedCandidate.reviewedAt ?? null,
        }
      : null,
  };
}
