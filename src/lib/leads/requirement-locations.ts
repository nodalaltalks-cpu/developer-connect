import { LeadValidationError } from "./errors.ts";
import type { RequirementLocation } from "./repository.ts";

/**
 * Preferred locations for a buyer requirement. Each location keeps the text as written (for display) and a
 * normalised KEY (for matching and to stop duplicates): lower-case, single spaces, and the Founder's naming
 * decision applied — "Bengaluru" is Bangalore. Pure, framework-free; a future project-location matcher compares keys.
 */

export const MAX_REQUIREMENT_LOCATIONS = 10;
export const MAX_LOCATION_LENGTH = 120;

/** Same-place spellings that must match each other. Deliberately tiny: only decisions the Founder has made. */
const LOCATION_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
};

export function locationKey(name: string): string {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  return LOCATION_ALIASES[key] ?? key;
}

/** Cleans a list of locations: trims, drops blanks, removes duplicates (first spelling wins), bounds count and length. */
export function normalizeLocations(input: unknown): RequirementLocation[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new LeadValidationError("locations", "Locations must be a list.");
  const out: RequirementLocation[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") throw new LeadValidationError("locations", "Each location must be text.");
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > MAX_LOCATION_LENGTH) {
      throw new LeadValidationError("locations", `A location is too long (max ${MAX_LOCATION_LENGTH} characters).`);
    }
    const key = locationKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, key });
  }
  if (out.length > MAX_REQUIREMENT_LOCATIONS) {
    throw new LeadValidationError("locations", `Choose at most ${MAX_REQUIREMENT_LOCATIONS} locations.`);
  }
  return out;
}
