/**
 * Core domain types for Developer Connect's developer directory and
 * official-website verification pipeline. See Phase 2A blueprint for the
 * product rationale behind this lifecycle.
 */

export type DeveloperStatus = "ACTIVE" | "INACTIVE";

/** The Developer fields a Founder may edit after creation — see UpdateDeveloperInput in developer-service.ts. */
export type DeveloperEditableField =
  | "legalName"
  | "displayName"
  | "city"
  | "state"
  | "country"
  | "headquartersLocation";

/** A partial patch holding only the fields that differ from the published values. */
export type DeveloperMetadataPatch = Partial<Record<DeveloperEditableField, string>>;

export interface Developer {
  id: string;
  /** Null when the registered legal entity is not known. */
  legalName: string | null;
  displayName: string;
  slug: string;
  /** Geography is data, not architecture — Mumbai is the first seeded value, not a schema assumption. */
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
  status: DeveloperStatus;
  /**
   * Founder-saved metadata edits not yet republished — null means
   * nothing pending. These fields (and only these) are what public pages
   * read; pendingChanges is never read by anything public. See
   * schema.ts's developers.pendingChanges comment for the full rationale.
   */
  pendingChanges: DeveloperMetadataPatch | null;
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

/**
 * FIELD_CHANGE = one editable Developer field changed (recorded at Save
 * time, whether or not the developer is currently published).
 * REPUBLISHED = the developer's whole pending patch was just made live.
 * DISCARDED = the whole pending patch was thrown away, unpublished.
 */
export type DeveloperEditEventType = "FIELD_CHANGE" | "REPUBLISHED" | "DISCARDED";

/**
 * One recorded change to a Developer — either a single field
 * (FIELD_CHANGE, with fieldName/previousValue/newValue set) or a
 * whole-patch action (REPUBLISHED/DISCARDED, all three null) —
 * deliberately separate from VerificationEvent, which is about a
 * WebsiteCandidate's verification-status lifecycle, not general
 * metadata edits. Append-only, same as VerificationEvent: there is no
 * update/delete operation.
 */
export interface DeveloperEditEvent {
  id: string;
  developerId: string;
  eventType: DeveloperEditEventType;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  actorType: ActorType;
  actorId: string;
  createdAt: Date;
}
