"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { submitWebsiteCandidate, addEvidence, updateCandidateUrl } from "@/lib/developer-connect/candidate-service";
import type { WebsiteCandidate, Evidence, DiscoverySource, EvidenceType } from "@/lib/developer-connect/types";

/**
 * Founder-only candidate + evidence intake. Both actions call
 * `requireFounderForAction` FIRST, then use only the existing,
 * already-tested candidate-service.ts functions — nothing here talks to
 * the database directly, and nothing here re-implements URL
 * normalization, denylist checks, or duplicate detection (all of that
 * lives in submitWebsiteCandidate itself). Ownership is validated by
 * those same service functions: submitWebsiteCandidate 404s on a
 * nonexistent developerId, addEvidence 404s on a nonexistent candidateId
 * — a fabricated id from the browser cannot attach data to the wrong (or
 * no) record.
 */

export interface SubmitCandidateActionInput {
  developerId: string;
  url: string;
  discoverySource: DiscoverySource;
}

export interface SubmitCandidateActionResult {
  ok: boolean;
  candidate?: WebsiteCandidate;
  error?: string;
}

export async function submitCandidateAction(
  input: SubmitCandidateActionInput,
): Promise<SubmitCandidateActionResult> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();

  try {
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: input.developerId,
      url: input.url,
      discoverySource: input.discoverySource,
      actor: { actorType: "FOUNDER", actorId: founderId },
    });
    revalidatePath(`/admin/developers/${input.developerId}`);
    revalidatePath("/admin/verification");
    revalidatePath(`/admin/verification/${candidate.id}`);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not submit website candidate." };
  }
}

export interface AddEvidenceActionInput {
  candidateId: string;
  evidenceType: EvidenceType;
  detail: string;
  sourceUrl?: string;
}

export interface AddEvidenceActionResult {
  ok: boolean;
  /** The newly added evidence item(s) — lets the caller update its own local state instead of re-fetching the whole page. */
  addedEvidence?: Evidence[];
  /** Adding evidence recomputes the candidate's confidenceScore as a side effect (see addEvidence in candidate-service.ts) — returned so the caller can keep that in sync too. */
  candidate?: WebsiteCandidate;
  error?: string;
}

export async function addEvidenceAction(
  input: AddEvidenceActionInput,
): Promise<AddEvidenceActionResult> {
  await requireFounderForAction();
  const repos = createPostgresRepositories();

  try {
    const addedEvidence = await addEvidence(repos, input.candidateId, [
      {
        evidenceType: input.evidenceType,
        detail: input.detail,
        sourceUrl: input.sourceUrl || undefined,
      },
    ]);
    const candidate = await repos.candidates.getById(input.candidateId);
    revalidatePath(`/admin/verification/${input.candidateId}`);
    return { ok: true, addedEvidence, candidate: candidate ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not add evidence." };
  }
}

export interface UpdateCandidateUrlActionInput {
  candidateId: string;
  url: string;
}

export interface UpdateCandidateUrlActionResult {
  ok: boolean;
  /** The freshly-persisted candidate, straight from the UPDATE's own return value — the caller must render from THIS, never re-derive from stale props, so the corrected URL is guaranteed to be what's actually in the database. */
  candidate?: WebsiteCandidate;
  error?: string;
}

/**
 * Founder correction of a discovered/pending candidate's URL — see
 * updateCandidateUrl in candidate-service.ts. Deliberately returns the
 * updated candidate rather than relying on the caller to re-fetch or on
 * router.refresh(): the same stale-value bug this task's Save fix
 * addresses for developer fields would otherwise be trivial to
 * reintroduce here.
 */
export async function updateCandidateUrlAction(
  input: UpdateCandidateUrlActionInput,
): Promise<UpdateCandidateUrlActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: "You don't have permission to edit this URL. Founder access is required." };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await updateCandidateUrl(repos, input.candidateId, input.url, {
      actorType: "FOUNDER",
      actorId: founderId,
    });
    // Not the queue itself: its inline URL editor already syncs the new URL
    // locally, and revalidating it would re-render the whole queue on every save.
    revalidatePath(`/admin/verification/${input.candidateId}`);
    revalidatePath(`/admin/developers/${candidate.developerId}`);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the new URL." };
  }
}
