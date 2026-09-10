"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { createDeveloper, findLikelyDuplicateDeveloper } from "@/lib/developer-connect/developer-service";
import { submitWebsiteCandidate } from "@/lib/developer-connect/candidate-service";
import type { Developer, WebsiteCandidate } from "@/lib/developer-connect/types";

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
  /**
   * The URL the founder believes is this developer's official website.
   * Submitting this does NOT verify or publish anything — it only creates
   * a WebsiteCandidate in its normal starting (DISCOVERED) state, via the
   * exact same submitWebsiteCandidate() the standalone "Add website
   * candidate" screen already uses. No new candidate logic, no schema
   * change, no auto-verification.
   */
  officialWebsite: string;
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
  /** Present when the developer was created AND its website candidate was created successfully. */
  candidate?: WebsiteCandidate;
  /**
   * Present when the developer was created but the website candidate
   * could not be (invalid URL, or a duplicate candidate already tracked)
   * — the developer record is real and kept; the founder can add/retry
   * the website separately via the existing standalone candidate screen.
   */
  candidateError?: string;
}

export async function createDeveloperAction(
  input: CreateDeveloperActionInput,
): Promise<CreateDeveloperActionResult> {
  const founderId = await requireFounderForAction();
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

    try {
      const candidate = await submitWebsiteCandidate(repos, {
        developerId: developer.id,
        url: input.officialWebsite,
        discoverySource: "MANUAL_SUBMISSION",
        actor: { actorType: "FOUNDER", actorId: founderId },
      });
      revalidatePath(`/admin/developers/${developer.id}`);
      return { ok: true, developer, candidate };
    } catch (candidateErr) {
      // The developer record is real and already created — never lose
      // that just because the website URL had a problem. The founder can
      // fix and retry the website on its own screen.
      return {
        ok: true,
        developer,
        candidateError:
          candidateErr instanceof Error ? candidateErr.message : "Could not add the official website.",
      };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create developer." };
  }
}
