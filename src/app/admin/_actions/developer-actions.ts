"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import {
  createDeveloper,
  updateDeveloper,
  republishDeveloper,
  discardPendingChanges,
  findLikelyDuplicateDeveloper,
} from "@/lib/developer-connect/developer-service";
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

export interface UpdateDeveloperActionInput {
  id: string;
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export interface UpdateDeveloperActionResult {
  ok: boolean;
  developer?: Developer;
  error?: string;
}

/**
 * Founder edit of an existing developer's core fields, used by the
 * "Save changes" control on the developer/candidate review page. This is
 * the ONLY place a developer record's fields can be changed after
 * creation — it never touches verification status, so saving edits can
 * never itself approve, reject, or publish anything.
 */
export async function updateDeveloperAction(
  input: UpdateDeveloperActionInput,
): Promise<UpdateDeveloperActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: "You don't have permission to edit developers. Founder access is required." };
  }

  const repos = createPostgresRepositories();
  try {
    const developer = await updateDeveloper(repos, input.id, input, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/developers/${input.id}`);
    revalidatePath("/admin/developers");
    revalidatePath(`/admin/verification`);
    return { ok: true, developer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save changes." };
  }
}

/**
 * Makes a published developer's pending metadata changes live. Requires
 * Founder authorization independently of updateDeveloperAction — a
 * non-Founder must not be able to publish a change even if they somehow
 * triggered a save. Revalidates the public developer page too, since
 * this is the one action that actually changes what it shows.
 */
export async function republishDeveloperAction(developerId: string): Promise<UpdateDeveloperActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: "You don't have permission to republish developers. Founder access is required." };
  }

  const repos = createPostgresRepositories();
  try {
    const developer = await republishDeveloper(repos, developerId, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/developers/${developerId}`);
    revalidatePath("/admin/developers");
    revalidatePath(`/developers/${developer.slug}`);
    revalidatePath("/");
    return { ok: true, developer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not republish this developer." };
  }
}

/**
 * Discards a published developer's pending metadata changes without
 * ever touching what's currently published.
 */
export async function discardPendingChangesAction(developerId: string): Promise<UpdateDeveloperActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: "You don't have permission to discard changes. Founder access is required." };
  }

  const repos = createPostgresRepositories();
  try {
    const developer = await discardPendingChanges(repos, developerId, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/developers/${developerId}`);
    revalidatePath("/admin/developers");
    return { ok: true, developer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not discard these changes." };
  }
}
