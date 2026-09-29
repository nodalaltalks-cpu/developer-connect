import type { PublicDeveloperProfile } from "./public-view.ts";

const SITE_NAME = "Developer Connects";

export interface DeveloperPageMetadataText {
  title: string;
  description: string;
}

/** A city is only used in public copy when it is actually present. */
function reliableCity(developer: PublicDeveloperProfile): string | null {
  const city = developer.city?.trim();
  return city ? city : null;
}

/**
 * Title/description for a developer page. A developer with no verified
 * website is not an "official website" page, so it gets a plain title and
 * an honest "verification in progress" description (the caller also
 * noindexes it). Verified copy is factual only: identity, official
 * website, location where known, and Developer Connects' role as the
 * verifier — no marketing claims.
 */
export function buildDeveloperMetadataText(developer: PublicDeveloperProfile): DeveloperPageMetadataText {
  const name = developer.displayName;
  const city = reliableCity(developer);

  if (!developer.officialWebsite) {
    return {
      title: `${name} | ${SITE_NAME}`,
      description: `${name} on ${SITE_NAME}. Official website verification is in progress.`,
    };
  }

  const domain = developer.officialWebsite.canonicalDomain;
  return {
    title: city
      ? `${name} Official Website in ${city} | ${SITE_NAME}`
      : `${name} Official Website | ${SITE_NAME}`,
    description: city
      ? `Official website of ${name}, a real estate developer in ${city}. ${SITE_NAME}, an independent directory, has verified ${domain} as its official website.`
      : `Official website of ${name}, a real estate developer. ${SITE_NAME}, an independent directory, has verified ${domain} as its official website.`,
  };
}

/**
 * JSON for a script tag of type application/ld+json. JSON.stringify leaves
 * the less-than character untouched, so a value containing a closing
 * script tag would end the element early. Each less-than is replaced with
 * its JSON unicode escape (backslash, "u003c"), which parses back to the
 * same character — the data is semantically identical — while making that
 * impossible. The two Unicode line separators are escaped the same way for
 * older parsers. The backslash is built from its char code so no escape
 * sequence has to be written literally here.
 */
export function serializeJsonLd(value: unknown): string {
  const backslash = String.fromCharCode(92);
  return JSON.stringify(value)
    .replace(/</g, backslash + "u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), backslash + "u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), backslash + "u2029");
}

/**
 * The "Also known as" line. The legal name is Founder-entered, and nothing
 * on the public page proves legal registration, so it is presented only as
 * another name — never as a registration fact. Null when absent, blank, or
 * the same as the display name.
 */
export function alsoKnownAs(developer: PublicDeveloperProfile): string | null {
  const legalName = developer.legalName?.trim();
  if (!legalName) return null;
  if (legalName.toLowerCase() === developer.displayName.trim().toLowerCase()) return null;
  return legalName;
}
