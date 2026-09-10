/**
 * Core domain types for Developer Connect's developer directory and
 * official-website verification pipeline. See Phase 2A blueprint for the
 * product rationale behind this lifecycle.
 */

export type DeveloperStatus = "ACTIVE" | "INACTIVE";

export interface Developer {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  /** Geography is data, not architecture — Mumbai is the first seeded value, not a schema assumption. */
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
  status: DeveloperStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A candidate website is a claim that a given URL is a developer's
 * official site. Only one candidate per developer may ever hold
 * `verificationStatus: "VERIFIED"` at a time; superseded and rejected
 * candidates are kept for auditability rather than deleted.
 */
export type VerificationStatus =
  | "DISCOVERED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "NEEDS_REVERIFICATION"
  | "INACTIVE";

export type DiscoverySource =
  | "MANUAL_SUBMISSION"
  | "SEARCH_ENGINE"
  | "REGULATORY_FILING"
  | "AGENT_CRAWL"
  | "OTHER";

export interface WebsiteCandidate {
  id: string;
  developerId: string;
  /** Original submitted/discovered URL, kept intact (path and query preserved). */
  url: string;
  /** Derived, normalized hostname used for de-duplication and denylist checks. */
  canonicalDomain: string;
  discoverySource: DiscoverySource;
  verificationStatus: VerificationStatus;
  /** A triage signal only — never sufficient on its own to reach VERIFIED. */
  confidenceScore: number;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  lastCheckedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type EvidenceType =
  | "BRANDING_MATCH"
  | "CORPORATE_IDENTITY_MATCH"
  | "LEGAL_NAME_MATCH"
  | "OFFICIAL_SOCIAL_BACKLINK"
  | "REGULATORY_FILING_REFERENCE"
  | "DOMAIN_OWNERSHIP_SIGNAL"
  | "SSL_DOMAIN_CONSISTENCY"
  | "OFFICIAL_CONTACT_INFO"
  | "MANUAL_CONFIRMATION"
  | "OTHER";

export interface Evidence {
  id: string;
  websiteCandidateId: string;
  evidenceType: EvidenceType;
  detail: string;
  sourceUrl?: string;
  capturedAt: Date;
}

/** Who or what performed a verification action. Founder approval can never be delegated to SYSTEM or AGENT. */
export type ActorType = "FOUNDER" | "SYSTEM" | "AGENT";

export interface Actor {
  actorType: ActorType;
  actorId: string;
}

/** Append-only audit trail. There is deliberately no update/delete operation for these records. */
export interface VerificationEvent {
  id: string;
  websiteCandidateId: string;
  previousStatus: VerificationStatus | null;
  newStatus: VerificationStatus;
  reason: string;
  actorType: ActorType;
  actorId: string;
  createdAt: Date;
}
