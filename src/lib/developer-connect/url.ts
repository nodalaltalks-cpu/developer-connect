import { InvalidUrlError } from "./errors.ts";

export interface NormalizedUrl {
  /** Original URL with hostname lowercased and default port stripped; path/query untouched. */
  url: string;
  /** Lowercased hostname with a leading "www." stripped, used for de-duplication and denylist checks. */
  canonicalDomain: string;
  /** Pathname with trailing slashes stripped (root stays "/"), used only for de-duplication. */
  normalizedPath: string;
}

/**
 * Normalizes an externally supplied URL. Treats the input as untrusted:
 * only http/https URLs are accepted, and nothing here rewrites or follows
 * the destination — that would mean acting on an unverified external site.
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidUrlError(`"${rawUrl}" is not a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError(`"${rawUrl}" must use http or https`);
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  if (
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
  ) {
    parsed.port = "";
  }

  const canonicalDomain = parsed.hostname.startsWith("www.")
    ? parsed.hostname.slice(4)
    : parsed.hostname;

  const normalizedPath =
    parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "/";

  return {
    url: parsed.toString(),
    canonicalDomain,
    normalizedPath,
  };
}
