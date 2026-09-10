import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper } from "../developer-service.ts";
import type { DeveloperConnectRepositories } from "../repository.ts";
import type { Developer } from "../types.ts";

/**
 * "Test Developer" names are deliberately fictitious and unlike any real
 * Mumbai developer, so nothing produced here could be mistaken for real
 * seed data if it ever leaked into a non-test context.
 */
export async function setUpTestDeveloper(
  overrides: Partial<{ legalName: string; displayName: string }> = {},
): Promise<{ repos: DeveloperConnectRepositories; developer: Developer }> {
  const repos = createInMemoryRepositories();
  const developer = await createDeveloper(repos.developers, {
    legalName: overrides.legalName ?? "Test Developer Private Limited",
    displayName: overrides.displayName ?? "Test Developer One",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  return { repos, developer };
}
