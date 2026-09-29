import type { Actor, Evidence, VerificationStatus, WebsiteCandidate } from "./types.ts";
import type { DeveloperConnectRepositories } from "./repository.ts";
import { assertValidTransition } from "./lifecycle.ts";
import {
  NotFoundError,
  UnauthorizedVerificationActionError,
  CrossDeveloperDomainConflictError,
} from "./errors.ts";

function requireFounder(actor: Actor, action: string): void {
  if (actor.actorType !== "FOUNDER") {
    throw new UnauthorizedVerificationActionError(
      `${action} requires a FOUNDER actor; received ${actor.actorType}`,
    );
  }
}

/**
 * The single place a website candidate's status ever changes. Every
 * transition is validated against the lifecycle state machine and
 * produces exactly one immutable VerificationEvent — there is no code
 * path that updates status without also appending history.
 */
export async function transitionCandidate(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  newStatus: VerificationStatus,
  actor: Actor,
  reason: string,
  extraPatch: Partial<{
    reviewedBy: string;
    reviewedAt: Date;
    rejectionReason: string;
    lastCheckedAt: Date;
  }> = {},
): Promise<WebsiteCandidate> {
  return repos.runInTransaction(async (txRepos) => {
    const candidate = await txRepos.candidates.getById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Website candidate ${candidateId} not found`);
    }

    assertValidTransition(candidate.verificationStatus, newStatus);

    const updated = await txRepos.candidates.update(candidateId, {
      verificationStatus: newStatus,
      ...extraPatch,
    });

    await txRepos.events.append({
      websiteCandidateId: candidateId,
      previousStatus: candidate.verificationStatus,
      newStatus,
      reason,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    return updated;
  });
}

/** Moves a candidate from DISCOVERED into the founder's review queue. */
export async function markReadyForReview(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason = "Evidence considered sufficient for founder review",
): Promise<WebsiteCandidate> {
  return transitionCandidate(repos, candidateId, "PENDING_VERIFICATION", actor, reason);
}

/** Matches the approve form's default, so a blank note at the service boundary reads the same as a blank note in the UI. */
const DEFAULT_APPROVAL_NOTE = "Reviewed and approved by founder";

/**
 * The internal audit text for one approval: the Founder's note, then a
 * snapshot of the evidence that existed when the decision was made.
 *
 * Evidence is never mandatory — with none, the snapshot says so plainly
 * rather than blocking. Only evidence row IDs and types go in (no detail
 * text, no source URLs): this is an internal trail, and those fields stay
 * where they already live.
 *
 * The Founder's note is untrusted free text (the Server Action accepts any
 * string), so it is collapsed to a single line. That keeps a note from
 * forging its own "Supporting evidence:" lines: every snapshot line below
 * is produced here, from rows this function was handed, never from input.
 * Ordering is by capturedAt then id so the snapshot is deterministic.
 */
function buildApprovalReason(note: string, evidenceItems: ReadonlyArray<Evidence>): string {
  const cleanNote = note.replace(/\s+/g, " ").trim() || DEFAULT_APPROVAL_NOTE;
  const header = `Founder approval: ${cleanNote}`;

  if (evidenceItems.length === 0) {
    return `${header}\nSupporting evidence: None recorded.`;
  }

  const ordered = [...evidenceItems].sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime() || a.id.localeCompare(b.id),
  );
  return [
    header,
    `Supporting evidence: ${ordered.length} item${ordered.length === 1 ? "" : "s"}`,
    `Types: ${ordered.map((item) => item.evidenceType).join(", ")}`,
    `Evidence IDs: ${ordered.map((item) => item.id).join(", ")}`,
  ].join("\n");
}

/**
 * The only path to VERIFIED. Requires an explicit FOUNDER actor — a high
 * confidence score is never sufficient on its own. Also enforces that at
 * most one candidate per developer is VERIFIED at a time, by retiring any
 * previously verified candidate to INACTIVE as part of the same action.
 *
 * Every transition to VERIFIED — first approval or re-verification, via
 * this function or approveAndPublishCandidate (which calls it) — records
 * a fresh evidence snapshot in that transition's own VerificationEvent
 * (see buildApprovalReason). The evidence is read from the database
 * inside this same transaction, never taken from the caller. Earlier
 * events are append-only and untouched, so each verification keeps the
 * snapshot from its own moment.
 */
export async function approveCandidate(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  requireFounder(actor, "Approving a website candidate as verified");

  // Everything below — reading the current verified candidate, retiring
  // it, and promoting the new one — happens inside one transaction, so a
  // failure partway through never leaves a developer with two verified
  // candidates or none.
  return repos.runInTransaction(async (txRepos) => {
    const candidate = await txRepos.candidates.getById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Website candidate ${candidateId} not found`);
    }

    // Cross-developer guard, checked before any mutation: the same domain
    // must never be VERIFIED for two different developers at once. Unlike
    // the same-developer case below (a legitimate domain change, handled
    // by retiring the old candidate), this is never auto-resolved — it
    // means either this candidate or the existing one is wrong, and only
    // a founder investigating both records can tell which.
    const domainConflict = await txRepos.candidates.findVerifiedByDomain(candidate.canonicalDomain);
    if (domainConflict && domainConflict.developerId !== candidate.developerId) {
      throw new CrossDeveloperDomainConflictError(
        `${candidate.canonicalDomain} is already the verified official website for a different developer. Resolve this manually before approving.`,
        domainConflict.developerId,
        domainConflict.id,
      );
    }

    const existingVerified = await txRepos.candidates.getVerifiedForDeveloper(candidate.developerId);
    if (existingVerified && existingVerified.id !== candidate.id) {
      await transitionCandidate(
        txRepos,
        existingVerified.id,
        "INACTIVE",
        { actorType: "SYSTEM", actorId: "verification-service" },
        `Superseded by newly verified candidate ${candidate.id}`,
      );
    }

    // Read as late as possible, in the same transaction as the write below,
    // so the snapshot is the evidence that existed at the actual approval.
    const evidenceAtApproval = await txRepos.evidence.listByCandidate(candidateId);

    return transitionCandidate(
      txRepos,
      candidateId,
      "VERIFIED",
      actor,
      buildApprovalReason(reason, evidenceAtApproval),
      {
        reviewedBy: actor.actorId,
        reviewedAt: new Date(),
      },
    );
  });
}

/**
 * The Founder-facing "Approve & Publish" action. A brand-new candidate
 * always starts at DISCOVERED, and the state machine has never allowed a
 * direct DISCOVERED -> VERIFIED jump (see lifecycle.ts) — previously the
 * only way to approve one was a separate, hidden "mark ready for review"
 * step the onboarding UI never exposed, so every first-time Approve click
 * threw InvalidTransitionError. This composes the existing, unmodified
 * markReadyForReview + approveCandidate steps into one atomic action so a
 * founder never has to take that intermediate step themselves — no new
 * transition is added to lifecycle.ts, and every transition still goes
 * through assertValidTransition and produces its own real history event.
 */
export async function approveAndPublishCandidate(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  requireFounder(actor, "Approving and publishing a website candidate");

  return repos.runInTransaction(async (txRepos) => {
    const candidate = await txRepos.candidates.getById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Website candidate ${candidateId} not found`);
    }

    if (candidate.verificationStatus === "DISCOVERED") {
      await markReadyForReview(
        txRepos,
        candidateId,
        actor,
        "Queued for founder review as part of Approve & Publish",
      );
    }

    return approveCandidate(txRepos, candidateId, actor, reason);
  });
}

export async function rejectCandidate(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  requireFounder(actor, "Rejecting a website candidate");
  return transitionCandidate(repos, candidateId, "REJECTED", actor, reason, {
    rejectionReason: reason,
  });
}

/** Sends a candidate back for more evidence rather than deciding on it yet. */
export async function requestMoreEvidence(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  requireFounder(actor, "Requesting more evidence");
  return transitionCandidate(repos, candidateId, "DISCOVERED", actor, reason);
}

/**
 * Flags a previously verified candidate for re-review. Unlike approve/
 * reject, this may be triggered by an automated health check (SYSTEM
 * actor) as well as a founder — detecting the problem doesn't require
 * the same authority as deciding what to do about it.
 */
export async function markNeedsReverification(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  return transitionCandidate(repos, candidateId, "NEEDS_REVERIFICATION", actor, reason);
}

export async function deactivateCandidate(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  actor: Actor,
  reason: string,
): Promise<WebsiteCandidate> {
  requireFounder(actor, "Deactivating a website candidate");
  return transitionCandidate(repos, candidateId, "INACTIVE", actor, reason);
}
