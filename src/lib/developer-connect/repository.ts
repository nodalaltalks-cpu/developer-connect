import type {
  Developer,
  DeveloperStatus,
  DeveloperMetadataPatch,
  WebsiteCandidate,
  VerificationStatus,
  Evidence,
  EvidenceType,
  DiscoverySource,
  VerificationEvent,
  DeveloperEditEvent,
  DeveloperEditEventType,
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
  legalName: string | null;
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
  /**
   * `null` explicitly clears the column; `undefined` (including an
   * omitted key) leaves it untouched. These are NOT interchangeable —
   * Drizzle's `.set()` silently drops an `undefined`-valued key from the
   * generated UPDATE statement rather than setting the column to NULL, so
   * a caller that means "clear this" must pass `null`, never `undefined`.
   */
  headquartersLocation?: string | null;
  status?: DeveloperStatus;
}

export interface DeveloperRepository {
  create(input: NewDeveloperInput): Promise<Developer>;
  getById(id: string): Promise<Developer | null>;
  /** Batch lookup by id — one query instead of N, for screens (like the verification queue) that need several developers' names at once. Missing/invalid ids are simply absent from the result, never an error. */
  getManyByIds(ids: string[]): Promise<Developer[]>;
  getBySlug(slug: string): Promise<Developer | null>;
  slugExists(slug: string): Promise<boolean>;
  list(filter?: { city?: string; status?: DeveloperStatus }): Promise<Developer[]>;
  /** Writes directly to the published columns — used only when there is no public boundary to protect (a developer that has never been published). */
  update(id: string, patch: DeveloperPatch): Promise<Developer>;
  /** Replaces (or clears, with null) the developer's pending, not-yet-published metadata patch. Never touches the published columns. */
  setPendingChanges(id: string, pendingChanges: DeveloperMetadataPatch | null): Promise<Developer>;
  /**
   * Atomically merges pendingChanges onto the published columns and
   * clears pendingChanges, in one statement — the only way published
   * values change for an already-published developer. Throws
   * NotFoundError if the developer doesn't exist or has no pending
   * changes to publish.
   */
  publishPendingChanges(id: string): Promise<Developer>;
  /**
   * Case-insensitive partial match against legal/display name, restricted
   * to ACTIVE developers. Plain SQL ILIKE, not a search engine — this is
   * a simple developer-name lookup, not a general-purpose search feature.
   *
   * `geo`, when given, narrows the same query by exact (not partial)
   * country/state/city match — pushed down into the query itself rather
   * than filtered afterward, so a geography-narrowed search still returns
   * up to `limit` real matches instead of first taking the top `limit`
   * name matches and only then discarding the ones outside the selected
   * geography.
   */
  search(query: string, limit?: number, geo?: DeveloperGeoFilter): Promise<Developer[]>;
  /**
   * Public-directory reads. Every method below sees only PUBLISHED
   * developers — ACTIVE, with their one VERIFIED website candidate — and
   * does its narrowing/limiting in the data layer, so a directory page
   * never has to load every verified row just to show a handful of them.
   */
  /**
   * One page of the published directory, ordered alphabetically by
   * display name (id as a tie-break, so consecutive pages never skip or
   * repeat a developer), plus `total` — how many published developers
   * match `filter` across all pages.
   */
  listPublishedPage(
    filter: PublishedDirectoryFilter,
    page: { limit: number; offset: number },
  ): Promise<{ entries: PublishedDeveloperEntry[]; total: number }>;
  /**
   * Up to `count` published developers chosen by a `seed`-stable shuffle
   * that spreads across distinct cities before repeating one — the
   * anonymous no-filter homepage's "initial discovery" view.
   */
  samplePublished(seed: string, count: number): Promise<PublishedDeveloperEntry[]>;
  /** How many published developers exist in total. */
  countPublished(): Promise<number>;
  /** The distinct country/state/city combinations that have at least one published developer. */
  listPublishedLocations(): Promise<PublishedLocation[]>;
}

/** A developer as the public directory may show it: ACTIVE, paired with its VERIFIED website candidate. */
export interface PublishedDeveloperEntry {
  developer: Developer;
  verifiedCandidate: WebsiteCandidate;
}

export interface PublishedLocation {
  country: string;
  state: string;
  city: string;
}

/**
 * The public directory's filter: exact (case-insensitive) geography plus
 * an optional free-text `query`, matched case-insensitively as a substring
 * of "display name, legal name, city, state, country, verified domain"
 * joined by single spaces.
 */
export interface PublishedDirectoryFilter extends DeveloperGeoFilter {
  query?: string;
}

/** Exact-match geography narrowing shared by DeveloperRepository.search and the public directory filters. */
export interface DeveloperGeoFilter {
  country?: string;
  state?: string;
  city?: string;
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
  /** Founder correction of the discovered URL — see updateCandidateUrl in candidate-service.ts. Never set alongside verificationStatus: editing the URL must never itself advance or reset the review state. */
  url?: string;
  canonicalDomain?: string;
}

export interface WebsiteCandidateRepository {
  create(input: NewWebsiteCandidateInput): Promise<WebsiteCandidate>;
  getById(id: string): Promise<WebsiteCandidate | null>;
  listByDeveloper(developerId: string): Promise<WebsiteCandidate[]>;
  /** For the founder's review queue — candidates in any of the given statuses, newest first. */
  listByStatuses(statuses: VerificationStatus[]): Promise<WebsiteCandidate[]>;
  /**
   * One page of listByStatuses — same statuses, same newest-first order
   * (id as a tie-break, so consecutive pages never skip or repeat a row) —
   * plus `total`, how many candidates match across all pages.
   */
  listByStatusesPage(
    statuses: VerificationStatus[],
    page: { limit: number; offset: number },
  ): Promise<{ candidates: WebsiteCandidate[]; total: number }>;
  /** Used for duplicate detection when a new candidate is submitted. */
  findByDomainAndPath(
    developerId: string,
    canonicalDomain: string,
    normalizedPath: string,
  ): Promise<WebsiteCandidate | null>;
  /** Enforces the "only one verified candidate per developer" invariant. */
  getVerifiedForDeveloper(developerId: string): Promise<WebsiteCandidate | null>;
  /**
   * Cross-developer check: is there already a VERIFIED candidate at this
   * canonical domain, regardless of which developer it belongs to? Used
   * to prevent the same domain silently becoming the verified official
   * site for two different Developer records.
   */
  findVerifiedByDomain(canonicalDomain: string): Promise<WebsiteCandidate | null>;
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

export interface NewDeveloperEditEventInput {
  developerId: string;
  eventType: DeveloperEditEventType;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  actorType: ActorType;
  actorId: string;
}

/** Append-only by design: no update or delete operation is exposed. */
export interface DeveloperEditEventRepository {
  append(input: NewDeveloperEditEventInput): Promise<DeveloperEditEvent>;
  listByDeveloper(developerId: string): Promise<DeveloperEditEvent[]>;
}

export interface DeveloperConnectRepositories {
  developers: DeveloperRepository;
  candidates: WebsiteCandidateRepository;
  evidence: EvidenceRepository;
  events: VerificationEventRepository;
  developerEditEvents: DeveloperEditEventRepository;
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
