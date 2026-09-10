"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import {
  approveCandidate,
  rejectCandidate,
  requestMoreEvidence,
  markNeedsReverification,
  deactivateCandidate,
} from "@/lib/developer-connect/verification-service";

/**
 * Every function here calls `requireFounderForAction` FIRST and passes
 * its result as the `actor` to the exact same verification-service.ts
 * functions the domain layer has used since Phase 2B — nothing here
 * mutates a row directly, and nothing here trusts the caller just
 * because a founder-only page happened to render the form. See auth.ts
 * for why the page-level check alone isn't enough.
 */

function revalidateCandidate(candidateId: string) {
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${candidateId}`);
}

export async function approveCandidateAction(candidateId: string, reason: string): Promise<void> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();
  await approveCandidate(repos, candidateId, { actorType: "FOUNDER", actorId: founderId }, reason);
  revalidateCandidate(candidateId);
}

export async function rejectCandidateAction(candidateId: string, reason: string): Promise<void> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();
  await rejectCandidate(repos, candidateId, { actorType: "FOUNDER", actorId: founderId }, reason);
  revalidateCandidate(candidateId);
}

export async function requestMoreEvidenceAction(
  candidateId: string,
  reason: string,
): Promise<void> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();
  await requestMoreEvidence(
    repos,
    candidateId,
    { actorType: "FOUNDER", actorId: founderId },
    reason,
  );
  revalidateCandidate(candidateId);
}

export async function markNeedsReverificationAction(
  candidateId: string,
  reason: string,
): Promise<void> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();
  await markNeedsReverification(
    repos,
    candidateId,
    { actorType: "FOUNDER", actorId: founderId },
    reason,
  );
  revalidateCandidate(candidateId);
}

export async function deactivateCandidateAction(
  candidateId: string,
  reason: string,
): Promise<void> {
  const founderId = await requireFounderForAction();
  const repos = createPostgresRepositories();
  await deactivateCandidate(
    repos,
    candidateId,
    { actorType: "FOUNDER", actorId: founderId },
    reason,
  );
  revalidateCandidate(candidateId);
}
