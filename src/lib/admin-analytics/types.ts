import type { RateMetric } from "./rate.ts";
import type { PeriodComparison } from "./period-comparison.ts";

export interface ConversionStep {
  label: string;
  count: number;
  /** Rate from the PREVIOUS step; null only for the first step, which has no previous step to compare against. */
  conversionFromPrevious: RateMetric | null;
}

export interface ExecutiveOverview {
  developersTracked: number;
  verifiedDevelopers: number;
  /**
   * Website candidates awaiting a first Founder decision — status
   * DISCOVERED or PENDING_VERIFICATION. Deliberately excludes
   * NEEDS_REVERIFICATION, which has its own tile right next to this one;
   * together the two tiles' totals equal the full /admin/verification
   * queue size (see PENDING_VERIFICATION_STATUSES in
   * verification-queue-state.ts, the shared source of truth both this
   * metric and that queue read from).
   */
  pendingVerification: number;
  needsReverification: number;
  totalSearches: number;
  successfulSearches: number;
  zeroResultSearches: number;
  developerPageViews: number;
  officialWebsiteClicks: number;
  activeUsers: number;
  profilesStarted: number;
  mobileShare: RateMetric;
  funnel: ConversionStep[];
  /** Official website clicks: the North Star. Overall conversion from all searches. */
  northStarConversion: RateMetric;
  /** Last 7 days vs the 7 days before that. Honest "insufficient data" when volume is too low to mean anything. */
  searchVolumeComparison: PeriodComparison;
  officialWebsiteClicksComparison: PeriodComparison;
}

export interface TopQuery {
  query: string;
  count: number;
}

export interface SearchBehaviorStats {
  /** Sessions where the exact same (lowercased) query was searched more than once. */
  repeatedSearchSessions: number;
  /** Sessions that tried more than one distinct query — refining their search. */
  refinedSearchSessions: number;
  /** Denominator for both of the above: sessions with at least one search. */
  searchingSessions: number;
}

export interface SearchIntelligence {
  totalSearches: number;
  uniqueQueries: number;
  topQueries: TopQuery[];
  /** Zero-result queries — literally "high demand, no verified website yet." */
  highDemandUnverified: TopQuery[];
  searchBehavior: SearchBehaviorStats;
  /** Real search volume grouped by the visitor's active geography filter at search time — never present for a filter-free search. */
  geographyDemand: GeographySearchDemand;
  /** Developers real visitors actually engage with, by real click-through events — never a fabricated popularity score. */
  topEngagedDevelopers: DeveloperEngagementRow[];
  authenticationSplit: SearchAuthenticationSplit;
}

export interface GeographyDemandRow {
  value: string;
  count: number;
}

export interface GeographySearchDemand {
  byCountry: GeographyDemandRow[];
  byState: GeographyDemandRow[];
  byCity: GeographyDemandRow[];
}

export interface DeveloperEngagementRow {
  developerId: string;
  displayName: string;
  searchResultClicks: number;
  developerPageViews: number;
  officialWebsiteClicks: number;
}

export interface SearchAuthenticationSplit {
  anonymousSearches: number;
  authenticatedSearches: number;
}

/**
 * A zero-result search query, cross-referenced against the actual
 * developer directory — never a synthesized "demand score." Exactly one
 * of three honest states, derived only from real search + directory data.
 */
export type VerificationOpportunityStatus = "NOT_INDEXED" | "INDEXED_UNVERIFIED" | "INDEXED_VERIFIED";

export interface VerificationOpportunity {
  query: string;
  searchCount: number;
  status: VerificationOpportunityStatus;
  developer: { id: string; displayName: string; slug: string } | null;
}

export interface DeveloperStat {
  developerId: string;
  displayName: string;
  slug: string;
  /** The developer's effective VerificationStatus, derived from its website-candidate lifecycle — never null in practice (a developer with no candidate at all reads as "DISCOVERED"); see effectiveVerificationStatusSql() in queries.ts. */
  verificationStatus: string | null;
  /** True when developers.pendingChanges is non-null — a real, data-backed fact, never inferred from client state. */
  hasPendingChanges: boolean;
  /** Count of search_result_clicked events for this developer — the real, available proxy for search demand (not total search volume, which isn't attributed per-developer). */
  searchResultClicks: number;
  pageViews: number;
  officialWebsiteClicks: number;
  ctr: RateMetric;
}

export interface DeveloperIntelligenceQuery {
  /** Matched against display name, legal name, or any of the developer's website-candidate domains — server-side, across the entire table. */
  search?: string;
  /**
   * "ALL" | "VERIFIED" | "NOT_VERIFIED" (any non-verified reason) | a
   * specific VerificationStatus value ("DISCOVERED",
   * "PENDING_VERIFICATION", "REJECTED", "NEEDS_REVERIFICATION",
   * "INACTIVE") — the granular values reflect a developer's *effective*
   * status, derived from its website-candidate lifecycle; see
   * effectiveVerificationStatusSql() in queries.ts.
   */
  status?: string;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface DeveloperIntelligencePage {
  developers: DeveloperStat[];
  /** Total developers matching the search/status filters — independent of pageSize, for "Showing X–Y of Z". */
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface VerificationOperations {
  discovered: number;
  pendingVerification: number;
  verified: number;
  rejected: number;
  needsReverification: number;
  inactive: number;
  /** Average hours between a candidate's creation and its VERIFIED decision, from real verification_events. */
  averageTurnaroundHours: number | null;
}

/**
 * Every ACTIVE developer, bucketed by its single effective verification
 * status (see effectiveVerificationStatusSql() in queries.ts) — a
 * developer-level count, deliberately distinct from VerificationOperations
 * above (which counts website candidates, not developers). Used by
 * Platform Health so its counts agree with what /admin/developers shows
 * when filtered by status.
 */
export interface DeveloperVerificationBreakdown {
  discovered: number;
  pendingVerification: number;
  verified: number;
  needsReverification: number;
  rejected: number;
  inactive: number;
}

/** Exact row counts for every application table — never estimated. */
export interface InfrastructureEntityCounts {
  developers: number;
  websiteCandidates: number;
  evidence: number;
  verificationEvents: number;
  profiles: number;
  notifications: number;
  analyticsEvents: number;
  developerEditEvents: number;
}

/** One table's real, measured size — pg_total_relation_size() (table + indexes + TOAST), a cheap metadata read, never a scan. */
export interface TableSizeInfo {
  tableName: string;
  sizeBytes: number;
}

export interface DataQuality {
  developersWithoutVerifiedWebsite: number;
  candidatesWithNoEvidence: number;
  verifiedNeverReChecked: number;
}

export interface AuditLogEntry {
  id: string;
  candidateId: string;
  developerName: string | null;
  previousStatus: string | null;
  newStatus: string;
  reason: string;
  actorType: string;
  actorId: string;
  createdAt: Date;
}

export interface CompletionBucket {
  /** e.g. "0–25%" */
  label: string;
  count: number;
}

export type DropOffLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface SectionDropOff {
  sectionId: string;
  title: string;
  /** n of d profiles that have completed every field in this section. */
  completionRate: RateMetric;
  /** null when the sample size is below MIN_SAMPLE_FOR_COMPARISON — never fabricated. */
  dropOff: DropOffLevel | null;
}

export interface EngagementByCompletion {
  metric: "searches" | "developerPageViews" | "officialWebsiteClicks";
  /** Average event count per user, for users with completion >= 50%. */
  higherCompletionAverage: number | null;
  /** Average event count per user, for users with completion < 50%. */
  lowerCompletionAverage: number | null;
  higherGroupSize: number;
  lowerGroupSize: number;
  /** true only when both groups reach MIN_SAMPLE_FOR_COMPARISON — an OBSERVATION requires this; below it, this is not evidence of anything. */
  sufficientData: boolean;
}

export interface UserAndProfileIntelligence {
  distinctSessions: number;
  distinctAuthenticatedUsers: number;
  sessionsPerUser: number | null;
  profilesStarted: number;
  /** Profiles created / updated within the last 7 days — the closest available proxy for "new"/"active" without a separate activity table. */
  newProfilesLast7Days: number;
  activeProfilesLast7Days: number;
  /** Always 0 while PROFILE_FIELD_CONFIG is empty — genuinely nothing to complete yet. */
  profileFieldsConfigured: number;
  averageCompletionPercent: number | null;
  completionDistribution: CompletionBucket[];
  sectionCompletion: SectionDropOff[];
  /** Correlation only, never causation — see PART 13's OBSERVATION-vs-HYPOTHESIS rule. Empty when profileFieldsConfigured is 0. */
  engagementByCompletion: EngagementByCompletion[];
}

/**
 * Deterministic, rule-based session tags (Part 8) — never an inferred/AI
 * classification. A session can match more than one of these; they are
 * independent signals, not a strict partition. Each carries its own exact
 * rule so the founder never has to trust an opaque label.
 */
export type UserSegment = "NEW" | "RETURNING" | "HIGH_INTENT" | "RESEARCHING" | "ZERO_RESULT_ONLY";

export interface UserSegmentCount {
  segment: UserSegment;
  count: number;
  /** The exact, human-readable rule used to classify a session into this segment. */
  definition: string;
}

export interface UserBehaviorIntelligence {
  distinctSessions: number;
  avgSearchesPerSession: number | null;
  avgDeveloperPageViewsPerSession: number | null;
  avgOfficialWebsiteClicksPerSession: number | null;
  mobileShare: RateMetric;
  segments: UserSegmentCount[];
}

export interface RetentionWindow {
  windowDays: 1 | 7 | 30;
  /** Sessions first seen at least `windowDays` ago — old enough that a return could have been observed. */
  eligibleSessions: number;
  /** Of those, sessions with at least one later event within the window. */
  rate: RateMetric;
}

export interface RetentionMetrics {
  windows: RetentionWindow[];
  /** 7-day return rate for sessions that DID vs did NOT reach an official-website click — the single behavioral comparison most tied to the North Star. */
  returnByOfficialWebsiteClick: {
    clicked: RateMetric;
    didNotClick: RateMetric;
    sufficientData: boolean;
  };
}

/** Derived purely from recency of the user's own last analytics event — never fabricated, never inferred beyond that. */
export type ActivityBand = "DAILY" | "WEEKLY" | "MONTHLY" | "INACTIVE" | "NEVER";

/** One real, already-recorded analytics event, reshaped for a human-readable admin timeline. Never fabricated — a 1:1 read of analytics_events. */
export interface UserActivityEvent {
  eventName: string;
  occurredAt: Date;
  /** Human-readable summary of the event's own payload (query text, developer name, field key, etc.) — null when the event type has nothing extra to show. */
  detail: string | null;
}

export interface AiReadiness {
  labeledVerificationDecisions: number;
  totalSearchEvents: number;
  distinctSearchQueries: number;
  zeroResultQueries: number;
  totalBehaviourEvents: number;
  profileFieldsConfigured: number;
}
