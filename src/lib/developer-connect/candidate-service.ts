import type { Actor, Evidence, EvidenceType, DiscoverySource, WebsiteCandidate } from "./types.ts";
import type { DeveloperConnectRepositories } from "./repository.ts";
import { normalizeUrl } from "./url.ts";
import { isDisqualifyingDomain, findDenylistEntry } from "./denylist.ts";
import { NotFoundError, DuplicateCandidateError, UnauthorizedVerificationActionError } from "./errors.ts";
import { transitionCandidate } from "./verification-service.ts";

/**
 * Evidence weights used only to triage the founder's review queue. This
 * is intentionally simple and transparent — not a model, and never a
 * substitute for the explicit human review that VERIFIED requires.
 */
const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
  MANUAL_CONFIRMATION: 0.4,
  REGULATORY_FILING_REFERENCE: 0.3,
  LEGAL_NAME_MATCH: 0.15,
  CORPORATE_IDENTITY_MATCH: 0.15,
  DOMAIN_OWNERSHIP_SIGNAL: 0.15,
  SSL_DOMAIN_CONSISTENCY: 0.1,
  OFFICIAL_SOCIAL_BACKLINK: 0.1,
  OFFICIAL_CONTACT_INFO: 0.05,
  BRANDING_MATCH: 0.05,
  OTHER: 0.02,
};

export function computeConfidenceScore(evidenceTypes: EvidenceType[]): number {
  const total = evidenceTypes.reduce((sum, type) => sum + (EVIDENCE_WEIGHTS[type] ?? 0), 0);
  return Math.min(1, Math.round(total * 100) / 100);
}

export interface NewEvidenceItem {
  evidenceType: EvidenceType;
  detail: string;
  sourceUrl?: string;
}

export interface SubmitWebsiteCandidateInput {
  developerId: string;
  url: string;
  discoverySource: DiscoverySource;
  /** Who or what is submitting this candidate (a founder's manual submission, or a future agent). */
  actor: Actor;
  initialEvidence?: NewEvidenceItem[];
}

/**
 * Intake for a new candidate official website. Always starts at
 * DISCOVERED — nothing here can reach PENDING_VERIFICATION or VERIFIED.
 * A domain matching the denylist (known portals, brokers, aggregators,
 * social platforms) is immediately and automatically rejected instead of
 * being allowed to sit in front of a founder as if it were plausible.
 */
export async function submitWebsiteCandidate(
  repos: DeveloperConnectRepositories,
  input: SubmitWebsiteCandidateInput,
): Promise<WebsiteCandidate> {
  return repos.runInTransaction(async (txRepos) => {
    const developer = await txRepos.developers.getById(input.developerId);
    if (!developer) {
      throw new NotFoundError(`Developer ${input.developerId} not found`);
    }

    const normalized = normalizeUrl(input.url);

    const existing = await txRepos.candidates.findByDomainAndPath(
      input.developerId,
      normalized.canonicalDomain,
      normalized.normalizedPath,
    );
    if (
      existing &&
      existing.verificationStatus !== "REJECTED" &&
      existing.verificationStatus !== "INACTIVE"
    ) {
      throw new DuplicateCandidateError(
        `A candidate for ${normalized.canonicalDomain}${normalized.normalizedPath} is already being tracked for this developer`,
        existing.id,
      );
    }

    const evidenceTypes = (input.initialEvidence ?? []).map((item) => item.evidenceType);
    const confidenceScore = computeConfidenceScore(evidenceTypes);

    const candidate = await txRepos.candidates.create({
      developerId: input.developerId,
      url: normalized.url,
      canonicalDomain: normalized.canonicalDomain,
      discoverySource: input.discoverySource,
      verificationStatus: "DISCOVERED",
      confidenceScore,
    });

    await txRepos.events.append({
      websiteCandidateId: candidate.id,
      previousStatus: null,
      newStatus: "DISCOVERED",
      reason: `Submitted via ${input.discoverySource}`,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
    });

    for (const item of input.initialEvidence ?? []) {
      await txRepos.evidence.add({ websiteCandidateId: candidate.id, ...item });
    }

    if (isDisqualifyingDomain(normalized.canonicalDomain)) {
      const entry = findDenylistEntry(normalized.canonicalDomain);
      const reason = entry
        ? `Automatically rejected: "${entry.domain}" is a known ${entry.category.toLowerCase().replace(/_/g, " ")}, not an official developer website`
        : `Automatically rejected: this domain is a known social media platform, not an official website`;
      return transitionCandidate(
        txRepos,
        candidate.id,
        "REJECTED",
        { actorType: "SYSTEM", actorId: "denylist-guard" },
        reason,
        { rejectionReason: reason },
      );
    }

    return candidate;
  });
}

/** Attaches more evidence to an existing candidate and recomputes its (triage-only) confidence score. */
export async function addEvidence(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  items: NewEvidenceItem[],
): Promise<Evidence[]> {
  return repos.runInTransaction(async (txRepos) => {
    const candidate = await txRepos.candidates.getById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Website candidate ${candidateId} not found`);
    }

    const added: Evidence[] = [];
    for (const item of items) {
      added.push(await txRepos.evidence.add({ websiteCandidateId: candidateId, ...item }));
    }

    const allEvidence = await txRepos.evidence.listByCandidate(candidateId);
    const confidenceScore = computeConfidenceScore(allEvidence.map((e) => e.evidenceType));
    await txRepos.candidates.update(candidateId, { confidenceScore });

    return added;
  });
}

/**
 * Founder correction of a discovered candidate's URL — e.g. the
 * automated discovery picked up a slightly wrong link. Deliberately
 * narrow: it only ever touches `url`/`canonicalDomain`, via the exact
 * same normalizeUrl() every other intake path uses, and appends one
 * VerificationEvent recording the change (previousStatus === newStatus,
 * since nothing about the review state itself changes) so the edit shows
 * up in the same "Verification history" list the founder already reads.
 *
 * Never touches verificationStatus. A DISCOVERED candidate stays
 * DISCOVERED, a VERIFIED (published) candidate stays VERIFIED — editing
 * the URL does not verify, publish, or reset anything. Approve & Publish
 * remains the only way to change what's live.
 */
export async function updateCandidateUrl(
  repos: DeveloperConnectRepositories,
  candidateId: string,
  newUrl: string,
  actor: Actor,
): Promise<WebsiteCandidate> {
  if (actor.actorType !== "FOUNDER") {
    throw new UnauthorizedVerificationActionError(
      `Editing a website candidate's URL requires a FOUNDER actor; received ${actor.actorType}`,
    );
  }

  return repos.runInTransaction(async (txRepos) => {
    const candidate = await txRepos.candidates.getById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Website candidate ${candidateId} not found`);
    }

    const normalized = normalizeUrl(newUrl);
    if (normalized.url === candidate.url) {
      // Nothing actually changed — a no-op save, not a new history entry.
      return candidate;
    }

    const conflict = await txRepos.candidates.findByDomainAndPath(
      candidate.developerId,
      normalized.canonicalDomain,
      normalized.normalizedPath,
    );
    if (
      conflict &&
      conflict.id !== candidate.id &&
      conflict.verificationStatus !== "REJECTED" &&
      conflict.verificationStatus !== "INACTIVE"
    ) {
      throw new DuplicateCandidateError(
        `A candidate for ${normalized.canonicalDomain}${normalized.normalizedPath} is already being tracked for this developer`,
        conflict.id,
      );
    }

    const previousUrl = candidate.url;
    const updated = await txRepos.candidates.update(candidateId, {
      url: normalized.url,
      canonicalDomain: normalized.canonicalDomain,
    });

    await txRepos.events.append({
      websiteCandidateId: candidateId,
      previousStatus: candidate.verificationStatus,
      newStatus: candidate.verificationStatus,
      reason: `URL corrected by Founder: "${previousUrl}" → "${normalized.url}"`,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    return updated;
  });
}
