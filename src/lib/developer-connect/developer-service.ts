import type { DeveloperRepository } from "./repository.ts";
import { makeUniqueSlug } from "./slug.ts";
import type { Developer } from "./types.ts";

export interface CreateDeveloperInput {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export async function createDeveloper(
  developers: DeveloperRepository,
  input: CreateDeveloperInput,
): Promise<Developer> {
  const legalName = input.legalName.trim();
  const displayName = input.displayName.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const country = input.country.trim();

  if (!legalName || !displayName || !city || !state || !country) {
    throw new Error("legalName, displayName, city, state, and country are required");
  }

  const slug = await makeUniqueSlug(displayName, (candidate) => developers.slugExists(candidate));

  return developers.create({
    legalName,
    displayName,
    slug,
    city,
    state,
    country,
    headquartersLocation: input.headquartersLocation?.trim() || undefined,
  });
}
