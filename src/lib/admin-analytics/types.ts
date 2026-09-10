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

export interface SearchIntelligence {
  totalSearches: number;
  uniqueQueries: number;
  topQueries: TopQuery[];
  /** Zero-result queries — literally "high demand, no verified website yet." */
  highDemandUnverified: TopQuery[];
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
  verificationStatus: string | null;
  /** Count of search_result_clicked events for this developer — the real, available proxy for search demand (not total search volume, which isn't attributed per-developer). */
  searchResultClicks: number;
  pageViews: number;
  officialWebsiteClicks: number;
  ctr: RateMetric;
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

export interface UserAndProfileIntelligence {
  distinctSessions: number;
  distinctAuthenticatedUsers: number;
  sessionsPerUser: number | null;
  profilesStarted: number;
  /** Always 0 while PROFILE_FIELD_CONFIG is empty — genuinely nothing to complete yet. */
  profileFieldsConfigured: number;
  averageCompletionPercent: number | null;
}

export interface AiReadiness {
  labeledVerificationDecisions: number;
  totalSearchEvents: number;
  distinctSearchQueries: number;
  zeroResultQueries: number;
  totalBehaviourEvents: number;
  profileFieldsConfigured: number;
}
