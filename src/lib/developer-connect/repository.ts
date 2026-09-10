import type {
  Developer,
  DeveloperStatus,
  WebsiteCandidate,
  VerificationStatus,
  Evidence,
  EvidenceType,
  DiscoverySource,
  VerificationEvent,
  ActorType,
} from "./types.ts";

/**
 * These interfaces are the boundary between Developer Connect's domain
 * logic and however data actually gets stored. Every service function in
 * this module depends only on these interfaces, never on a concrete
 * database — so choosing production storage later does not require
 * touching business logic, only writing a new implementation of these
 * same contracts.
 */

export interface NewDeveloperInput {
  legalName: string;
  displayName: string;
  slug: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export interface DeveloperPatch {
  legalName?: string;
  displayName?: string;
  city?: string;
  state?: string;
  country?: string;
  headquartersLocation?: string;
  status?: DeveloperStatus;
}

export interface DeveloperRepository {
  create(input: NewDeveloperInput): Promise<Developer>;
  getById(id: string): Promise<Developer | null>;
  getBySlug(slug: string): Promise<Developer | null>;
  slugExists(slug: string): Promise<boolean>;
  list(filter?: { city?: string; status?: DeveloperStatus }): Promise<Developer[]>;
  update(id: string, patch: DeveloperPatch): Promise<Developer>;
  /**
   * Case-insensitive partial match against legal/display name, restricted
   * to ACTIVE developers. Plain SQL ILIKE, not a search engine — this is
   * a simple developer-name lookup, not a general-purpose search feature.
   */
  search(query: string, limit?: number): Promise<Developer[]>;
}

export interface NewWebsiteCandidateInput {
  developerId: string;
  url: string;
  canonicalDomain: string;
  discoverySource: DiscoverySource;
  verificationStatus: VerificationStatus;
  confidenceScore: number;
}

export interface WebsiteCandidatePatch {
  verificationStatus?: VerificationStatus;
  confidenceScore?: number;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  lastCheckedAt?: Date;
}

export interface WebsiteCandidateRepository {
  create(input: NewWebsiteCandidateInput): Promise<WebsiteCandidate>;
  getById(id: string): Promise<WebsiteCandidate | null>;
  listByDeveloper(developerId: string): Promise<WebsiteCandidate[]>;
  /** For the founder's review queue — candidates in any of the given statuses, newest first. */
  listByStatuses(statuses: VerificationStatus[]): Promise<WebsiteCandidate[]>;
  /** Used for duplicate detection when a new candidate is submitted. */
  findByDomainAndPath(
    developerId: string,
    canonicalDomain: string,
    normalizedPath: string,
  ): Promise<WebsiteCandidate | null>;
  /** Enforces the "only one verified candidate per developer" invariant. */
  getVerifiedForDeveloper(developerId: string): Promise<WebsiteCandidate | null>;
  update(id: string, patch: WebsiteCandidatePatch): Promise<WebsiteCandidate>;
}

export interface NewEvidenceInput {
  websiteCandidateId: string;
  evidenceType: EvidenceType;
  detail: string;
  sourceUrl?: string;
}

export interface EvidenceRepository {
  add(input: NewEvidenceInput): Promise<Evidence>;
  listByCandidate(candidateId: string): Promise<Evidence[]>;
}

export interface NewVerificationEventInput {
  websiteCandidateId: string;
  previousStatus: VerificationStatus | null;
  newStatus: VerificationStatus;
  reason: string;
  actorType: ActorType;
  actorId: string;
}

/** Append-only by design: no update or delete operation is exposed. */
export interface VerificationEventRepository {
  append(input: NewVerificationEventInput): Promise<VerificationEvent>;
  listByCandidate(candidateId: string): Promise<VerificationEvent[]>;
}

export interface DeveloperConnectRepositories {
  developers: DeveloperRepository;
  candidates: WebsiteCandidateRepository;
  evidence: EvidenceRepository;
  events: VerificationEventRepository;
  /**
   * Runs `fn` with a repositories bundle scoped to a single atomic unit of
   * work. A real database adapter opens a transaction and passes back
   * transaction-scoped repositories; if `fn` throws, nothing it wrote is
   * kept. An adapter with no meaningful transaction concept (e.g. the
   * in-memory reference implementation) may simply invoke `fn` with
   * itself. Callers that need atomicity (e.g. approving a candidate)
   * depend on this rather than on any specific database's API.
   */
  runInTransaction<T>(fn: (repos: DeveloperConnectRepositories) => Promise<T>): Promise<T>;
}
