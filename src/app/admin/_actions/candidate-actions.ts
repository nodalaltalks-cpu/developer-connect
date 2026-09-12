"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { submitWebsiteCandidate, addEvidence } from "@/lib/developer-connect/candidate-service";
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
