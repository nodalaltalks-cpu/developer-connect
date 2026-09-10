"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { createDeveloper, findLikelyDuplicateDeveloper } from "@/lib/developer-connect/developer-service";
import type { Developer } from "@/lib/developer-connect/types";

/**
 * Founder-only developer intake. Calls `requireFounderForAction` FIRST —
 * a browser calling this action directly, without the founder-only UI in
 * front of it, gets the same rejection a non-founder would. See
 * verification-actions.ts for the established pattern this mirrors.
 */

export interface CreateDeveloperActionInput {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export interface DuplicateDeveloperSummary {
  id: string;
  displayName: string;
  slug: string;
}

export interface CreateDeveloperActionResult {
  ok: boolean;
  developer?: Developer;
  error?: string;
  duplicateOf?: DuplicateDeveloperSummary;
}

export async function createDeveloperAction(
  input: CreateDeveloperActionInput,
): Promise<CreateDeveloperActionResult> {
  await requireFounderForAction();
  const repos = createPostgresRepositories();

  try {
    const duplicate = await findLikelyDuplicateDeveloper(repos.developers, {
      legalName: input.legalName,
      displayName: input.displayName,
    });
    if (duplicate) {
      return {
        ok: false,
        error: `This looks like it may already exist as "${duplicate.displayName}". Review the existing record before creating a new one.`,
        duplicateOf: { id: duplicate.id, displayName: duplicate.displayName, slug: duplicate.slug },
      };
    }

    const developer = await createDeveloper(repos.developers, input);
    revalidatePath("/admin/developers");
    return { ok: true, developer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create developer." };
  }
}
