"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import {
  approveAndPublishCandidate,
  rejectCandidate,
  requestMoreEvidence,
  markNeedsReverification,
  deactivateCandidate,
} from "@/lib/developer-connect/verification-service";
import {
  NotFoundError,
  InvalidTransitionError,
  UnauthorizedVerificationActionError,
  CrossDeveloperDomainConflictError,
} from "@/lib/developer-connect/errors";
import type { WebsiteCandidate, VerificationStatus, Developer, Evidence, VerificationEvent } from "@/lib/developer-connect/types";

/**
 * Every function here calls `requireFounderForAction` FIRST and passes
 * its result as the `actor` to the exact same verification-service.ts
 * functions the domain layer has used since Phase 2B — nothing here
 * mutates a row directly, and nothing here trusts the caller just
 * because a founder-only page happened to render the form. See auth.ts
 * for why the page-level check alone isn't enough.
 *
 * Every action returns a `{ ok, error }` result instead of throwing —
 * the whole reason the old "That action didn't go through. Please try
 * again." message existed is that a thrown error crossing the Server
 * Action boundary gets sanitized to an opaque digest in production, and
 * the client component then discarded even that. Returning a structured
 * result lets the real, specific reason reach the founder.
 */

export interface VerificationActionResult {
  ok: boolean;
  candidate?: WebsiteCandidate;
  error?: string;
}

const STATUS_COPY: Record<VerificationStatus, string> = {
  DISCOVERED: "not yet reviewed",
  PENDING_VERIFICATION: "queued for review",
  VERIFIED: "already verified and published",
  REJECTED: "already rejected",
  NEEDS_REVERIFICATION: "flagged for re-verification",
  INACTIVE: "deactivated",
};

/** Turns a raw domain error into the specific, plain-English reason a founder can act on. */
function describeVerificationError(err: unknown): string {
  if (err instanceof NotFoundError) {
    return "This website candidate could not be found. It may have been removed — refresh the page and try again.";
  }
  if (err instanceof CrossDeveloperDomainConflictError) {
    return `Can't publish. ${err.message}`;
  }
  if (err instanceof UnauthorizedVerificationActionError) {
    return "You don't have permission to do that. Founder access is required.";
  }
  if (err instanceof InvalidTransitionError) {
    const match = err.message.match(/from (\w+) to (\w+)/);
    if (match) {
      const [, from, to] = match as [string, VerificationStatus, VerificationStatus];
      const fromCopy = STATUS_COPY[from] ?? from.toLowerCase();
      if (to === "VERIFIED") {
        if (from === "VERIFIED") return "This website is already verified and published — no action needed.";
        if (from === "REJECTED") {
          return 'Can\'t publish. This website was already rejected. Use "Request more evidence" to reopen it, then approve again.';
        }
        if (from === "INACTIVE") {
          return "Can't publish. This candidate was deactivated. Reopen it before approving.";
        }
      }
      return `Can't do that right now — this candidate is ${fromCopy}.`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Could not complete this action.";
}

function revalidateCandidate(candidateId: string, developerId?: string) {
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${candidateId}`);
  if (developerId) revalidatePath(`/admin/developers/${developerId}`);
}

/** Founder-friendly message for the (UI-unreachable, defense-in-depth-only) case of a direct call bypassing the founder-only page. */
const AUTH_ERROR = "You don't have permission to do that. Founder access is required.";

export interface CandidateReviewData {
  candidate: WebsiteCandidate;
  developer: Developer | null;
  evidenceList: Evidence[];
  history: VerificationEvent[];
  /** Other website candidates ever submitted for the same developer, most recent first — excludes `candidate` itself. */
  otherCandidates: WebsiteCandidate[];
}

export interface CandidateReviewDataResult {
  ok: boolean;
  data?: CandidateReviewData;
  error?: string;
}

/**
 * Everything the founder review screen (/admin/verification/[candidateId])
 * already fetches server-side, available as one on-demand call — this is
 * what powers the inline accordion review on /admin/verification: the
 * collapsed queue row never pays for this data, only the row a founder
 * actually expands does. Reuses the exact same repositories that page
 * uses; no new query shape, no duplicated business logic.
 */
export async function getCandidateReviewDataAction(candidateId: string): Promise<CandidateReviewDataResult> {
  try {
    await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  const candidate = await repos.candidates.getById(candidateId);
  if (!candidate) {
    return { ok: false, error: "This website candidate could not be found. It may have been removed." };
  }

  const [developer, evidenceList, history, siblingCandidates] = await Promise.all([
    repos.developers.getById(candidate.developerId),
    repos.evidence.listByCandidate(candidateId),
    repos.events.listByCandidate(candidateId),
    repos.candidates.listByDeveloper(candidate.developerId),
  ]);

  const otherCandidates = siblingCandidates
    .filter((c) => c.id !== candidate.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { ok: true, data: { candidate, developer, evidenceList, history, otherCandidates } };
}

export async function approveCandidateAction(
  candidateId: string,
  reason: string,
): Promise<VerificationActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await approveAndPublishCandidate(
      repos,
      candidateId,
      { actorType: "FOUNDER", actorId: founderId },
      reason,
    );
    revalidateCandidate(candidateId, candidate.developerId);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: describeVerificationError(err) };
  }
}

export async function rejectCandidateAction(
  candidateId: string,
  reason: string,
): Promise<VerificationActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await rejectCandidate(
      repos,
      candidateId,
      { actorType: "FOUNDER", actorId: founderId },
      reason,
    );
    revalidateCandidate(candidateId, candidate.developerId);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: describeVerificationError(err) };
  }
}

export async function requestMoreEvidenceAction(
  candidateId: string,
  reason: string,
): Promise<VerificationActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await requestMoreEvidence(
      repos,
      candidateId,
      { actorType: "FOUNDER", actorId: founderId },
      reason,
    );
    revalidateCandidate(candidateId, candidate.developerId);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: describeVerificationError(err) };
  }
}

export async function markNeedsReverificationAction(
  candidateId: string,
  reason: string,
): Promise<VerificationActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await markNeedsReverification(
      repos,
      candidateId,
      { actorType: "FOUNDER", actorId: founderId },
      reason,
    );
    revalidateCandidate(candidateId, candidate.developerId);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: describeVerificationError(err) };
  }
}

export async function deactivateCandidateAction(
  candidateId: string,
  reason: string,
): Promise<VerificationActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const repos = createPostgresRepositories();
  try {
    const candidate = await deactivateCandidate(
      repos,
      candidateId,
      { actorType: "FOUNDER", actorId: founderId },
      reason,
    );
    revalidateCandidate(candidateId, candidate.developerId);
    return { ok: true, candidate };
  } catch (err) {
    return { ok: false, error: describeVerificationError(err) };
  }
}
