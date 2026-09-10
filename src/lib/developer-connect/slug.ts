const DIACRITICS_REGEX = /\p{Diacritic}/gu;

/** Deterministic, URL-safe slug generation for developer names. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(DIACRITICS_REGEX, "") // strip diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Builds a slug guaranteed not to collide with an existing one, by
 * appending -2, -3, ... as needed. `slugExists` is queried against the
 * real store so this is safe to use against a database-backed repository.
 */
export async function makeUniqueSlug(
  baseName: string,
  slugExists: (slug: string) => Promise<boolean> | boolean,
): Promise<string> {
  const base = slugify(baseName);
  if (!base) {
    throw new Error("Cannot generate a slug from an empty name");
  }

  if (!(await slugExists(base))) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (await slugExists(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
