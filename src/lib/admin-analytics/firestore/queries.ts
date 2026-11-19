import type { Query } from "firebase-admin/firestore";
import { getFirestoreDb } from "../../firestore/client.ts";
import { compareCodePoints, toTs } from "../../firestore/convert.ts";
import { readEvents, type StoredEvent } from "../../firestore/analytics-events.ts";
import { PENDING_REVIEW_STATUSES } from "../../developer-connect/verification-queue-state.ts";
import { computeRate } from "../rate.ts";
import { comparePeriods, type PeriodComparison } from "../period-comparison.ts";
import { getPreviousPeriod, type ResolvedDateRange } from "../date-range.ts";
import type {
  ConversionStep,
  DeveloperEngagementRow,
  ExecutiveOverview,
  GeographySearchDemand,
  SearchAuthenticationSplit,
  SearchBehaviorStats,
  SearchIntelligence,
} from "../types.ts";

/**
 * Firestore versions of the founder-dashboard queries (see ../queries.ts for the definition of every metric - the
 * definitions are unchanged, only where the numbers come from).
 *
 * Firestore has no GROUP BY or COUNT(DISTINCT), so:
 *  - plain counts use aggregation queries (nothing is downloaded);
 *  - anything grouped or distinct reads the matching events of the range once (only the events it needs) and groups
 *    them here. These are founder-only pages opened a few times a day, never public traffic.
 */

const db = () => getFirestoreDb();

export type EventName = string;

function buildFunnel(steps: { label: string; count: number }[]): ConversionStep[] {
  return steps.map((step, i) => ({
    label: step.label,
    count: step.count,
    conversionFromPrevious: i === 0 ? null : computeRate(step.count, steps[i - 1].count),
  }));
}

/** A count of events by name (any of `names`) in an optional range, with optional extra equality/range filters. */
export async function countEventsWhere(names: EventName[] | null, range: { start?: Date; end?: Date }, extra: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = []): Promise<number> {
  let q: Query = db().collection("analyticsEvents");
  if (names && names.length === 1) q = q.where("eventName", "==", names[0]);
  else if (names && names.length > 1) q = q.where("eventName", "in", names);
  if (range.start) q = q.where("occurredAt", ">=", toTs(range.start));
  if (range.end) q = q.where("occurredAt", "<", toTs(range.end));
  for (const [field, op, value] of extra) q = q.where(field, op, value);
  return (await q.count().get()).data().count;
}

const countRange = (names: EventName[], range?: ResolvedDateRange, extra: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = []) =>
  countEventsWhere(names, { start: range?.start, end: range?.end }, extra);

async function compareCurrentToPreviousPeriod(names: EventName[], range: ResolvedDateRange): Promise<PeriodComparison> {
  const previous = getPreviousPeriod(range);
  const [current, previousCount] = await Promise.all([
    countEventsWhere(names, { start: range.start, end: range.end }),
    countEventsWhere(names, { start: previous.start, end: previous.end }),
  ]);
  return comparePeriods(current, previousCount);
}

async function collectionCount(name: string, where?: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]>): Promise<number> {
  let q: Query = db().collection(name);
  for (const [f, op, v] of where ?? []) q = q.where(f, op, v);
  return (await q.count().get()).data().count;
}

export async function getExecutiveOverview(range?: ResolvedDateRange): Promise<ExecutiveOverview> {
  const [developersTracked, verifiedDevelopers, pendingVerification, needsReverification, profilesStarted] = await Promise.all([
    collectionCount("developers"),
    collectionCount("websiteCandidates", [["verificationStatus", "==", "VERIFIED"]]),
    collectionCount("websiteCandidates", [["verificationStatus", "in", [...PENDING_REVIEW_STATUSES]]]),
    collectionCount("websiteCandidates", [["verificationStatus", "==", "NEEDS_REVERIFICATION"]]),
    collectionCount("profiles"),
  ]);

  const [successfulSearches, zeroResultSearches, searchResultClicks, developerPageViews, officialWebsiteClicks] = await Promise.all([
    countRange(["search_performed"], range),
    countRange(["zero_result_search"], range),
    countRange(["search_result_clicked"], range),
    countRange(["developer_page_viewed"], range),
    countRange(["official_website_clicked"], range),
  ]);
  const totalSearches = successfulSearches + zeroResultSearches;

  // Distinct signed-in users in the range: read only the user id of each event that has one.
  const withUser = await readEvents({ from: range?.start, to: range?.end, fields: ["userId"] });
  const activeUsers = new Set(withUser.filter((e) => e.userId).map((e) => e.userId)).size;

  const [mobile, deviceKnown] = await Promise.all([
    countEventsWhere(null, { start: range?.start, end: range?.end }, [["payload.deviceType", "==", "mobile"]]),
    countEventsWhere(null, { start: range?.start, end: range?.end }, [["payload.deviceType", ">", ""]]),
  ]);

  let searchVolumeComparison: PeriodComparison;
  let officialWebsiteClicksComparison: PeriodComparison;
  if (range) {
    [searchVolumeComparison, officialWebsiteClicksComparison] = await Promise.all([
      compareCurrentToPreviousPeriod(["search_performed", "zero_result_search"], range),
      compareCurrentToPreviousPeriod(["official_website_clicked"], range),
    ]);
  } else {
    // No range given: the original fixed 7-day-vs-7-day comparison.
    const now = new Date();
    const periodMs = 7 * 24 * 60 * 60 * 1000;
    const currentStart = new Date(now.getTime() - periodMs);
    const previousStart = new Date(now.getTime() - 2 * periodMs);
    const compare = async (names: EventName[]) => {
      const [current, previous] = await Promise.all([
        countEventsWhere(names, { start: currentStart, end: now }),
        countEventsWhere(names, { start: previousStart, end: currentStart }),
      ]);
      return comparePeriods(current, previous);
    };
    [searchVolumeComparison, officialWebsiteClicksComparison] = await Promise.all([compare(["search_performed", "zero_result_search"]), compare(["official_website_clicked"])]);
  }

  return {
    developersTracked,
    verifiedDevelopers,
    pendingVerification,
    needsReverification,
    totalSearches,
    successfulSearches,
    zeroResultSearches,
    developerPageViews,
    officialWebsiteClicks,
    activeUsers,
    profilesStarted,
    mobileShare: computeRate(mobile, deviceKnown),
    northStarConversion: computeRate(officialWebsiteClicks, totalSearches),
    funnel: buildFunnel([
      { label: "Searches", count: totalSearches },
      { label: "Results clicked", count: searchResultClicks },
      { label: "Developer pages viewed", count: developerPageViews },
      { label: "Connect requests", count: officialWebsiteClicks },
    ]),
    searchVolumeComparison,
    officialWebsiteClicksComparison,
  };
}

// --- search intelligence -----------------------------------------------------------------------------------------

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);

function topCounts(values: Array<string | null>, limit: number): Array<{ value: string; count: number }> {
  const tally = new Map<string, number>();
  for (const v of values) if (v !== null) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit);
}

export async function getSearchIntelligence(range?: ResolvedDateRange): Promise<SearchIntelligence> {
  const searches = await readEvents({ from: range?.start, to: range?.end, names: ["search_performed", "zero_result_search"] });
  const performed = searches.filter((e) => e.eventName === "search_performed");
  const zero = searches.filter((e) => e.eventName === "zero_result_search");
  const queryOf = (e: StoredEvent) => lower(e.payload.query);

  // The SQL grouped on lower(query); an event with no query text falls in a NULL group, which shows as a row with an empty query.
  const top = (events: StoredEvent[]) => topCounts(events.map((e) => queryOf(e) ?? ""), 10).map(({ value, count }) => ({ query: value, count }));

  const [geographyDemand, topEngagedDevelopers] = await Promise.all([getSearchGeographyDemand(searches), getTopEngagedDevelopers(range)]);

  return {
    totalSearches: performed.length + zero.length,
    uniqueQueries: new Set(searches.map((e) => queryOf(e))).size,
    topQueries: top(performed),
    highDemandUnverified: top(zero),
    searchBehavior: getSearchBehaviorStats(searches),
    geographyDemand,
    topEngagedDevelopers,
    authenticationSplit: getSearchAuthenticationSplit(searches),
  };
}

async function getSearchGeographyDemand(searches: StoredEvent[]): Promise<GeographySearchDemand> {
  const byField = (field: "country" | "state" | "city") =>
    topCounts(searches.map((e) => (typeof e.payload[field] === "string" ? (e.payload[field] as string) : null)), 10).map(({ value, count }) => ({ value, count }));
  return { byCountry: byField("country"), byState: byField("state"), byCity: byField("city") };
}

async function getTopEngagedDevelopers(range?: ResolvedDateRange): Promise<DeveloperEngagementRow[]> {
  const events = await readEvents({ from: range?.start, to: range?.end, names: ["search_result_clicked", "developer_page_viewed", "official_website_clicked"] });
  const byDeveloper = new Map<string, { searchResultClicks: number; developerPageViews: number; officialWebsiteClicks: number }>();
  for (const e of events) {
    if (!e.developerId) continue;
    const entry = byDeveloper.get(e.developerId) ?? { searchResultClicks: 0, developerPageViews: 0, officialWebsiteClicks: 0 };
    if (e.eventName === "search_result_clicked") entry.searchResultClicks += 1;
    else if (e.eventName === "developer_page_viewed") entry.developerPageViews += 1;
    else if (e.eventName === "official_website_clicked") entry.officialWebsiteClicks += 1;
    byDeveloper.set(e.developerId, entry);
  }
  const ids = [...byDeveloper.keys()];
  if (ids.length === 0) return [];
  const docs = await db().getAll(...ids.map((id) => db().collection("developers").doc(id)));
  const nameById = new Map(docs.filter((d) => d.exists).map((d) => [d.id, d.data()!.displayName as string]));
  return [...byDeveloper.entries()]
    .map(([developerId, counts]) => ({ developerId, displayName: nameById.get(developerId) ?? "Unknown developer", ...counts }))
    .sort((a, b) => b.officialWebsiteClicks - a.officialWebsiteClicks || b.developerPageViews - a.developerPageViews)
    .slice(0, 10);
}

function getSearchAuthenticationSplit(searches: StoredEvent[]): SearchAuthenticationSplit {
  const authenticated = searches.filter((e) => e.userId !== null).length;
  return { anonymousSearches: searches.length - authenticated, authenticatedSearches: authenticated };
}

/** Per-session: "repeated" = the same session tried the same query again; "refined" = more than one distinct query. */
function getSearchBehaviorStats(searches: StoredEvent[]): SearchBehaviorStats {
  const bySession = new Map<string, Array<string | null>>();
  for (const e of searches) bySession.set(e.sessionId, [...(bySession.get(e.sessionId) ?? []), lower(e.payload.query)]);
  let repeated = 0;
  let refined = 0;
  for (const queries of bySession.values()) {
    // count(distinct query) ignores NULLs, exactly like SQL.
    const distinct = new Set(queries.filter((q) => q !== null)).size;
    if (queries.length > distinct) repeated += 1;
    if (distinct > 1) refined += 1;
  }
  return { searchingSessions: bySession.size, repeatedSearchSessions: repeated, refinedSearchSessions: refined };
}

// --- developers, verification, audit --------------------------------------------------------------------------

import { PROFILE_FIELD_CONFIG } from "../../profile/field-config.ts";
import type {
  AiReadiness,
  AuditLogEntry,
  DataQuality,
  DeveloperIntelligencePage,
  DeveloperIntelligenceQuery,
  DeveloperStat,
  VerificationOperations,
} from "../types.ts";

const DEFAULT_DEVELOPER_PAGE_SIZE = 25;
const GRANULAR_VERIFICATION_STATUSES = ["DISCOVERED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "NEEDS_REVERIFICATION", "INACTIVE"] as const;

/** The most currently-relevant candidate status wins (see effectiveVerificationStatusSql in ../queries.ts). */
const STATUS_PRIORITY: Record<string, number> = { VERIFIED: 1, NEEDS_REVERIFICATION: 2, PENDING_VERIFICATION: 3, DISCOVERED: 4, REJECTED: 5, INACTIVE: 6 };

type Doc = FirebaseFirestore.DocumentData;
type Where3 = Array<[string, FirebaseFirestore.WhereFilterOp, unknown]>;

/** Documents whose `field` is one of `ids`, 30 ids per query, a few queries at a time. */
async function docsWhereIn(collection: string, field: string, ids: string[], extra: Where3 = []): Promise<Array<{ id: string; data: Doc }>> {
  const unique = [...new Set(ids)];
  const out: Array<{ id: string; data: Doc }> = [];
  for (let i = 0; i < unique.length; i += 30 * 5) {
    const parts = await Promise.all(
      Array.from({ length: 5 }, (_, k) => unique.slice(i + k * 30, i + k * 30 + 30))
        .filter((p) => p.length > 0)
        .map(async (part) => {
          let q: Query = db().collection(collection).where(field, "in", part);
          for (const [f, op, v] of extra) q = q.where(f, op, v);
          return (await q.get()).docs;
        }),
    );
    for (const docs of parts) for (const d of docs) out.push({ id: d.id, data: d.data() });
  }
  return out;
}

export async function getDeveloperIntelligence(query: DeveloperIntelligenceQuery = {}, range?: ResolvedDateRange): Promise<DeveloperIntelligencePage> {
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_DEVELOPER_PAGE_SIZE;
  const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
  const status = query.status ?? "ALL";
  const term = query.search?.trim().toLowerCase();

  const [developerSnap, candidateSnap] = await Promise.all([
    db().collection("developers").where("status", "==", "ACTIVE").get(),
    db().collection("websiteCandidates").select("developerId", "verificationStatus", "canonicalDomain").get(),
  ]);
  const candidatesByDeveloper = new Map<string, Array<{ status: string; domain: string }>>();
  for (const c of candidateSnap.docs) {
    const d = c.data();
    candidatesByDeveloper.set(d.developerId, [...(candidatesByDeveloper.get(d.developerId) ?? []), { status: d.verificationStatus, domain: d.canonicalDomain ?? "" }]);
  }
  const effectiveStatus = (id: string) =>
    (candidatesByDeveloper.get(id) ?? []).map((c) => c.status).sort((a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99))[0] ?? "DISCOVERED";

  const matching = developerSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as { id: string } & Doc)
    .filter((d) => {
      const cands = candidatesByDeveloper.get(d.id) ?? [];
      if (term && !(String(d.displayName).toLowerCase().includes(term) || String(d.legalName ?? "").toLowerCase().includes(term) || cands.some((c) => c.domain.toLowerCase().includes(term)))) return false;
      if (status === "VERIFIED") return cands.some((c) => c.status === "VERIFIED");
      if (status === "NOT_VERIFIED") return !cands.some((c) => c.status === "VERIFIED");
      if ((GRANULAR_VERIFICATION_STATUSES as readonly string[]).includes(status)) return effectiveStatus(d.id) === status;
      // An unrecognised status (a stale or hand-edited URL) matches nothing rather than falling back to "ALL".
      return status === "ALL";
    })
    .sort((a, b) => compareCodePoints(String(a.displayName), String(b.displayName)) || compareCodePoints(a.id, b.id));

  const pageRows = matching.slice((page - 1) * pageSize, page * pageSize);
  const stats: DeveloperStat[] = await Promise.all(
    pageRows.map(async (row) => {
      const where: Where3 = [["developerId", "==", row.id]];
      const [searchResultClicks, pageViews, clicks] = await Promise.all([
        countRange(["search_result_clicked"], range, where),
        countRange(["developer_page_viewed"], range, where),
        countRange(["official_website_clicked"], range, where),
      ]);
      return {
        developerId: row.id,
        displayName: row.displayName,
        slug: row.slug,
        verificationStatus: effectiveStatus(row.id),
        hasPendingChanges: row.pendingChanges != null,
        searchResultClicks,
        pageViews,
        officialWebsiteClicks: clicks,
        ctr: computeRate(clicks, pageViews),
      };
    }),
  );
  return { developers: stats, totalCount: matching.length, page, pageSize };
}

export async function getVerificationOperations(range?: ResolvedDateRange): Promise<VerificationOperations> {
  const statusCount = (s: string) => collectionCount("websiteCandidates", [["verificationStatus", "==", s]]);
  const [discovered, pendingVerification, verified, rejected, needsReverification, inactive] = await Promise.all(
    ["DISCOVERED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "NEEDS_REVERIFICATION", "INACTIVE"].map(statusCount),
  );

  // Turnaround: each VERIFIED transition, measured from that candidate's creation event (the one with no previous status).
  let q: Query = db().collection("verificationEvents").where("newStatus", "==", "VERIFIED");
  if (range) q = q.where("createdAt", ">=", toTs(range.start)).where("createdAt", "<", toTs(range.end));
  const verifiedEvents = (await q.get()).docs.map((d) => ({ candidateId: d.data().websiteCandidateId as string, at: (d.data().createdAt as { toDate(): Date }).toDate() }));
  const created = await docsWhereIn("verificationEvents", "websiteCandidateId", verifiedEvents.map((e) => e.candidateId), [["previousStatus", "==", null]]);
  const createdAt = new Map<string, Date>();
  for (const c of created) createdAt.set(c.data.websiteCandidateId, (c.data.createdAt as { toDate(): Date }).toDate());
  const hours = verifiedEvents.flatMap((e) => (createdAt.has(e.candidateId) ? [(e.at.getTime() - createdAt.get(e.candidateId)!.getTime()) / 3_600_000] : []));
  const avg = hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null;

  return { discovered, pendingVerification, verified, rejected, needsReverification, inactive, averageTurnaroundHours: avg !== null ? Math.round(avg * 10) / 10 : null };
}

export async function getVerificationActivity(range: ResolvedDateRange): Promise<Record<(typeof GRANULAR_VERIFICATION_STATUSES)[number], number>> {
  const snap = await db().collection("verificationEvents").where("createdAt", ">=", toTs(range.start)).where("createdAt", "<", toTs(range.end)).select("newStatus").get();
  const result = Object.fromEntries(GRANULAR_VERIFICATION_STATUSES.map((s) => [s, 0])) as Record<(typeof GRANULAR_VERIFICATION_STATUSES)[number], number>;
  for (const d of snap.docs) {
    const s = d.data().newStatus as (typeof GRANULAR_VERIFICATION_STATUSES)[number];
    if (s in result) result[s] += 1;
  }
  return result;
}

export async function getDataQuality(): Promise<DataQuality> {
  const [active, published, stale, unreviewed] = await Promise.all([
    collectionCount("developers", [["status", "==", "ACTIVE"]]),
    // `isPublished` is "ACTIVE with a verified candidate", maintained with every candidate change.
    collectionCount("developers", [["isPublished", "==", true]]),
    collectionCount("websiteCandidates", [["verificationStatus", "==", "VERIFIED"], ["lastCheckedAt", "==", null]]),
    db().collection("websiteCandidates").where("verificationStatus", "in", ["DISCOVERED", "PENDING_VERIFICATION"]).select().get(),
  ]);
  const withEvidence = new Set((await docsWhereIn("evidence", "websiteCandidateId", unreviewed.docs.map((d) => d.id))).map((e) => e.data.websiteCandidateId as string));
  return {
    developersWithoutVerifiedWebsite: active - published,
    candidatesWithNoEvidence: unreviewed.docs.filter((d) => !withEvidence.has(d.id)).length,
    verifiedNeverReChecked: stale,
  };
}

export async function getAuditLog(limit = 100, range?: ResolvedDateRange): Promise<AuditLogEntry[]> {
  let q: Query = db().collection("verificationEvents");
  if (range) q = q.where("createdAt", ">=", toTs(range.start)).where("createdAt", "<", toTs(range.end));
  const events = (await q.orderBy("createdAt", "desc").limit(limit).get()).docs;
  const candidateIds = [...new Set(events.map((e) => e.data().websiteCandidateId as string))];
  const candidates = candidateIds.length ? await db().getAll(...candidateIds.map((id) => db().collection("websiteCandidates").doc(id))) : [];
  const developerIdOf = new Map(candidates.filter((c) => c.exists).map((c) => [c.id, c.data()!.developerId as string]));
  const developerIds = [...new Set(developerIdOf.values())];
  const developers = developerIds.length ? await db().getAll(...developerIds.map((id) => db().collection("developers").doc(id))) : [];
  const nameOf = new Map(developers.filter((d) => d.exists).map((d) => [d.id, d.data()!.displayName as string]));
  return events.map((e) => {
    const d = e.data();
    return {
      id: e.id,
      candidateId: d.websiteCandidateId,
      developerName: nameOf.get(developerIdOf.get(d.websiteCandidateId) ?? "") ?? null,
      previousStatus: d.previousStatus ?? null,
      newStatus: d.newStatus,
      reason: d.reason,
      actorType: d.actorType,
      actorId: d.actorId,
      createdAt: (d.createdAt as { toDate(): Date }).toDate(),
    };
  });
}

export async function getAiReadiness(): Promise<AiReadiness> {
  const [labeledVerificationDecisions, searches, zeroResultQueries, totalBehaviourEvents] = await Promise.all([
    db().collection("verificationEvents").where("actorType", "==", "FOUNDER").count().get().then((r) => r.data().count),
    readEvents({ names: ["search_performed", "zero_result_search"] }),
    countEventsWhere(["zero_result_search"], {}),
    countEventsWhere(null, {}),
  ]);
  return {
    labeledVerificationDecisions,
    totalSearchEvents: searches.length,
    distinctSearchQueries: new Set(searches.map((e) => lower(e.payload.query))).size,
    zeroResultQueries,
    totalBehaviourEvents,
    profileFieldsConfigured: PROFILE_FIELD_CONFIG.length,
  };
}

// --- users, behaviour, retention, timelines, infrastructure ---------------------------------------------------

import { PROFILE_SECTIONS } from "../../profile/field-config.ts";
import { calculateProfileCompletion } from "../../profile/completion.ts";
import { MIN_SAMPLE_FOR_COMPARISON } from "../period-comparison.ts";
import type {
  DeveloperVerificationBreakdown,
  EngagementByCompletion,
  InfrastructureEntityCounts,
  RetentionMetrics,
  RetentionWindow,
  TableSizeInfo,
  UserActivityEvent,
  UserAndProfileIntelligence,
  UserBehaviorIntelligence,
  UserSegment,
  UserSegmentCount,
} from "../types.ts";

function completionBucketLabel(percentage: number): string {
  if (percentage >= 100) return "100%";
  if (percentage >= 76) return "76–99%";
  if (percentage >= 51) return "51–75%";
  if (percentage >= 26) return "26–50%";
  return "0–25%";
}
const COMPLETION_BUCKET_LABELS = ["0–25%", "26–50%", "51–75%", "76–99%", "100%"];

/** Documented, fixed thresholds - never derived from a statistical test. */
function dropOffLevel(percent: number): "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" {
  if (percent >= 80) return "LOW";
  if (percent >= 60) return "MEDIUM";
  if (percent >= 40) return "HIGH";
  return "VERY_HIGH";
}

const ENGAGEMENT_EVENT_NAMES = ["search_performed", "developer_page_viewed", "official_website_clicked"] as const;

const inRange = (field: string, range?: { start: Date; end: Date }): Where3 => (range ? [[field, ">=", toTs(range.start)], [field, "<", toTs(range.end)]] : []);

export async function getUserAndProfileIntelligence(range?: ResolvedDateRange): Promise<UserAndProfileIntelligence> {
  const events = await readEvents({ from: range?.start, to: range?.end, fields: ["sessionId", "userId", "eventName"] });
  const distinctSessions = new Set(events.map((e) => e.sessionId)).size;
  const distinctAuthenticatedUsers = new Set(events.filter((e) => e.userId).map((e) => e.userId)).size;

  const fallbackWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const windowWhere = (field: string): Where3 => (range ? inRange(field, range) : [[field, ">=", toTs(fallbackWindowStart)]]);
  const [profilesStarted, newProfilesInRange, activeProfilesInRange, profileDocs] = await Promise.all([
    collectionCount("profiles"),
    collectionCount("profiles", windowWhere("createdAt")),
    collectionCount("profiles", windowWhere("updatedAt")),
    db().collection("profiles").select("data").get(),
  ]);

  const completions = profileDocs.docs.map((d) => ({ userId: d.id, completion: calculateProfileCompletion((d.data().data ?? {}) as Record<string, unknown>) }));
  const percentages = completions.map((c) => c.completion.percentage).filter((v): v is number => v !== null);
  const averageCompletionPercent = percentages.length > 0 ? Math.round((percentages.reduce((s, v) => s + v, 0) / percentages.length) * 10) / 10 : null;

  const distribution: Record<string, number> = Object.fromEntries(COMPLETION_BUCKET_LABELS.map((l) => [l, 0]));
  for (const p of percentages) distribution[completionBucketLabel(p)] += 1;

  const sectionCompletion = PROFILE_SECTIONS.map((section) => {
    const completeCount = completions.filter((c) => c.completion.sections.find((s) => s.sectionId === section.id)?.complete).length;
    const rate = computeRate(completeCount, percentages.length);
    return {
      sectionId: section.id,
      title: section.title,
      completionRate: rate,
      dropOff: percentages.length >= MIN_SAMPLE_FOR_COMPARISON && rate.percent !== null ? dropOffLevel(rate.percent) : null,
    };
  });

  let engagementByCompletion: EngagementByCompletion[] = [];
  if (PROFILE_FIELD_CONFIG.length > 0) {
    const perUser = new Map<string, Map<string, number>>();
    for (const e of events) {
      if (!e.userId || !(ENGAGEMENT_EVENT_NAMES as readonly string[]).includes(e.eventName)) continue;
      const byEvent = perUser.get(e.userId) ?? new Map<string, number>();
      byEvent.set(e.eventName, (byEvent.get(e.eventName) ?? 0) + 1);
      perUser.set(e.userId, byEvent);
    }
    const higher = completions.filter((c) => (c.completion.percentage ?? 0) >= 50);
    const lower = completions.filter((c) => (c.completion.percentage ?? 0) < 50);
    const metricKey: Record<(typeof ENGAGEMENT_EVENT_NAMES)[number], EngagementByCompletion["metric"]> = {
      search_performed: "searches",
      developer_page_viewed: "developerPageViews",
      official_website_clicked: "officialWebsiteClicks",
    };
    engagementByCompletion = ENGAGEMENT_EVENT_NAMES.map((eventName) => {
      const average = (group: typeof completions) => (group.length > 0 ? group.reduce((s, c) => s + (perUser.get(c.userId)?.get(eventName) ?? 0), 0) / group.length : null);
      const hi = average(higher);
      const lo = average(lower);
      return {
        metric: metricKey[eventName],
        higherCompletionAverage: hi !== null ? Math.round(hi * 10) / 10 : null,
        lowerCompletionAverage: lo !== null ? Math.round(lo * 10) / 10 : null,
        higherGroupSize: higher.length,
        lowerGroupSize: lower.length,
        sufficientData: higher.length >= MIN_SAMPLE_FOR_COMPARISON && lower.length >= MIN_SAMPLE_FOR_COMPARISON,
      };
    });
  }

  return {
    distinctSessions,
    distinctAuthenticatedUsers,
    sessionsPerUser: distinctAuthenticatedUsers > 0 ? Math.round((distinctSessions / distinctAuthenticatedUsers) * 10) / 10 : null,
    profilesStarted,
    newProfilesInRange,
    activeProfilesInRange,
    profileFieldsConfigured: PROFILE_FIELD_CONFIG.length,
    averageCompletionPercent,
    completionDistribution: COMPLETION_BUCKET_LABELS.map((label) => ({ label, count: distribution[label] })),
    sectionCompletion,
    engagementByCompletion,
  };
}

export async function getUserBehaviorIntelligence(range?: ResolvedDateRange): Promise<UserBehaviorIntelligence> {
  const events = await readEvents({ from: range?.start, to: range?.end, fields: ["sessionId", "eventName"] });
  const distinctSessions = new Set(events.map((e) => e.sessionId)).size;
  const count = (...names: string[]) => events.filter((e) => names.includes(e.eventName)).length;
  const searchCount = count("search_performed", "zero_result_search");
  const pageViewCount = count("developer_page_viewed");
  const clickCount = count("official_website_clicked");

  const [mobile, anyDevice, unknownDevice] = await Promise.all([
    countEventsWhere(null, { start: range?.start, end: range?.end }, [["payload.deviceType", "==", "mobile"]]),
    countEventsWhere(null, { start: range?.start, end: range?.end }, [["payload.deviceType", ">", ""]]),
    countEventsWhere(null, { start: range?.start, end: range?.end }, [["payload.deviceType", "==", "unknown"]]),
  ]);

  // One summary per session, then the five independent tags.
  type Summary = { days: Set<string>; click: boolean; pageView: boolean; success: boolean; zero: boolean };
  const sessions = new Map<string, Summary>();
  for (const e of events) {
    const s = sessions.get(e.sessionId) ?? { days: new Set<string>(), click: false, pageView: false, success: false, zero: false };
    s.days.add(e.occurredAt.toISOString().slice(0, 10));
    if (e.eventName === "official_website_clicked") s.click = true;
    if (e.eventName === "developer_page_viewed") s.pageView = true;
    if (e.eventName === "search_performed") s.success = true;
    if (e.eventName === "zero_result_search") s.zero = true;
    sessions.set(e.sessionId, s);
  }
  const all = [...sessions.values()];
  const segmentCounts: Record<UserSegment, number> = {
    NEW: all.filter((s) => s.days.size === 1).length,
    RETURNING: all.filter((s) => s.days.size > 1).length,
    HIGH_INTENT: all.filter((s) => s.click).length,
    RESEARCHING: all.filter((s) => s.pageView && !s.click).length,
    ZERO_RESULT_ONLY: all.filter((s) => s.zero && !s.success).length,
  };
  const segmentDefinitions: Record<UserSegment, string> = {
    NEW: "All of this session's activity happened on a single calendar day.",
    RETURNING: "This session has activity on more than one calendar day.",
    HIGH_INTENT: "This session reached at least one official-website click.",
    RESEARCHING: "This session viewed at least one developer page but hasn't clicked an official website yet.",
    ZERO_RESULT_ONLY: "Every search this session made returned zero results — never a single successful search.",
  };
  const segments: UserSegmentCount[] = (Object.keys(segmentDefinitions) as UserSegment[]).map((segment) => ({ segment, count: segmentCounts[segment], definition: segmentDefinitions[segment] }));

  return {
    distinctSessions,
    avgSearchesPerSession: distinctSessions > 0 ? Math.round((searchCount / distinctSessions) * 10) / 10 : null,
    avgDeveloperPageViewsPerSession: distinctSessions > 0 ? Math.round((pageViewCount / distinctSessions) * 10) / 10 : null,
    avgOfficialWebsiteClicksPerSession: distinctSessions > 0 ? Math.round((clickCount / distinctSessions) * 10) / 10 : null,
    mobileShare: computeRate(mobile, anyDevice - unknownDevice),
    segments,
  };
}

/** Retention is computed over every session ever recorded, so it is cached for a few minutes. */
let retentionCache: { at: number; value: RetentionMetrics } | null = null;
const RETENTION_TTL_MS = 10 * 60_000;

export async function getRetentionMetrics(): Promise<RetentionMetrics> {
  if (retentionCache && Date.now() - retentionCache.at < RETENTION_TTL_MS) return retentionCache.value;
  const events = await readEvents({ fields: ["sessionId", "eventName"] });
  const bySession = new Map<string, { times: number[]; click: boolean }>();
  for (const e of events) {
    const s = bySession.get(e.sessionId) ?? { times: [], click: false };
    s.times.push(e.occurredAt.getTime());
    if (e.eventName === "official_website_clicked") s.click = true;
    bySession.set(e.sessionId, s);
  }
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const now = Date.now();
  // A session "returned" when it has activity more than an hour after it began and within the window.
  const returnedWithin = (times: number[], windowDays: number) => {
    const first = Math.min(...times);
    return times.some((t) => t > first + HOUR && t <= first + windowDays * DAY);
  };
  const windowFor = (windowDays: 1 | 7 | 30): RetentionWindow => {
    let eligible = 0;
    let returned = 0;
    for (const s of bySession.values()) {
      if (Math.min(...s.times) > now - windowDays * DAY) continue;
      eligible += 1;
      if (returnedWithin(s.times, windowDays)) returned += 1;
    }
    return { windowDays, eligibleSessions: eligible, rate: computeRate(returned, eligible) };
  };

  let clickedEligible = 0;
  let clickedReturned = 0;
  let notClickedEligible = 0;
  let notClickedReturned = 0;
  for (const s of bySession.values()) {
    if (Math.min(...s.times) > now - 7 * DAY) continue;
    const returned = returnedWithin(s.times, 7);
    if (s.click) {
      clickedEligible += 1;
      if (returned) clickedReturned += 1;
    } else {
      notClickedEligible += 1;
      if (returned) notClickedReturned += 1;
    }
  }

  const value: RetentionMetrics = {
    windows: [windowFor(1), windowFor(7), windowFor(30)],
    returnByOfficialWebsiteClick: {
      clicked: computeRate(clickedReturned, clickedEligible),
      didNotClick: computeRate(notClickedReturned, notClickedEligible),
      sufficientData: clickedEligible >= MIN_SAMPLE_FOR_COMPARISON && notClickedEligible >= MIN_SAMPLE_FOR_COMPARISON,
    },
  };
  retentionCache = { at: Date.now(), value };
  return value;
}

export async function getUserActivityTimeline(userId: string, limit = 50): Promise<UserActivityEvent[]> {
  const events = await readEvents({ userId, newestFirst: true, limit });
  const ids = [...new Set(events.flatMap((e) => (e.developerId ? [e.developerId] : [])))];
  const docs = ids.length ? await db().getAll(...ids.map((id) => db().collection("developers").doc(id))) : [];
  const nameOf = new Map(docs.filter((d) => d.exists).map((d) => [d.id, d.data()!.displayName as string]));
  return events.map((e) => ({ eventName: e.eventName as UserActivityEvent["eventName"], occurredAt: e.occurredAt, detail: describeActivity(e.eventName, e.payload, e.developerId ? (nameOf.get(e.developerId) ?? null) : null) }));
}

export async function getLastActivityByUserIds(userIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  await Promise.all(
    userIds.map(async (userId) => {
      const latest = await readEvents({ userId, newestFirst: true, limit: 1, fields: [] });
      if (latest[0]) out.set(userId, latest[0].occurredAt);
    }),
  );
  return out;
}

function describeActivity(eventName: string, payload: Record<string, unknown>, developerName: string | null): string | null {
  switch (eventName) {
    case "search_performed":
      return typeof payload.query === "string" ? `Searched "${payload.query}"` : null;
    case "zero_result_search":
      return typeof payload.query === "string" ? `No results for "${payload.query}"` : null;
    case "search_result_clicked":
      return developerName ? `Opened ${developerName} from search results` : null;
    case "developer_page_viewed":
      return developerName ? `Viewed ${developerName}'s page` : null;
    case "official_website_clicked":
      // Rows from before Stage 5 carry a targetDomain and really were website visits; newer rows are connect requests.
      if (typeof payload.targetDomain === "string") return developerName ? `Visited ${developerName}'s official website` : `Visited ${payload.targetDomain}`;
      return developerName ? `Asked to connect with ${developerName}` : null;
    case "profile_started":
      return "Started their profile";
    case "profile_field_completed":
      return typeof payload.fieldKey === "string" ? `Added a value for "${payload.fieldKey}"` : null;
    case "profile_updated":
      return "Updated their profile";
    case "profile_completion_reached":
      return typeof payload.percentage === "number" ? `Profile reached ${payload.percentage}%` : null;
    default:
      return null;
  }
}

export async function getDeveloperVerificationBreakdown(): Promise<DeveloperVerificationBreakdown> {
  const [developerSnap, candidateSnap] = await Promise.all([
    db().collection("developers").where("status", "==", "ACTIVE").select().get(),
    db().collection("websiteCandidates").select("developerId", "verificationStatus").get(),
  ]);
  const byDeveloper = new Map<string, string[]>();
  for (const c of candidateSnap.docs) byDeveloper.set(c.data().developerId, [...(byDeveloper.get(c.data().developerId) ?? []), c.data().verificationStatus]);
  const counts: DeveloperVerificationBreakdown = { discovered: 0, pendingVerification: 0, verified: 0, needsReverification: 0, rejected: 0, inactive: 0 };
  const keyByStatus: Record<string, keyof DeveloperVerificationBreakdown> = {
    DISCOVERED: "discovered",
    PENDING_VERIFICATION: "pendingVerification",
    VERIFIED: "verified",
    NEEDS_REVERIFICATION: "needsReverification",
    REJECTED: "rejected",
    INACTIVE: "inactive",
  };
  for (const d of developerSnap.docs) {
    const effective = (byDeveloper.get(d.id) ?? []).sort((a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99))[0] ?? "DISCOVERED";
    const key = keyByStatus[effective];
    if (key) counts[key] += 1;
  }
  return counts;
}

export async function getInfrastructureEntityCounts(): Promise<InfrastructureEntityCounts> {
  const [developers, websiteCandidates, evidence, verificationEvents, profiles, notifications, analyticsEvents, developerEditEvents] = await Promise.all(
    ["developers", "websiteCandidates", "evidence", "verificationEvents", "profiles", "notifications", "analyticsEvents", "developerEditEvents"].map((c) => collectionCount(c)),
  );
  return { developers, websiteCandidates, evidence, verificationEvents, profiles, notifications, analyticsEvents, developerEditEvents };
}

/** Firestore does not report per-collection sizes to the application (see the Firebase console for storage usage). */
export async function getDatabaseTableSizes(): Promise<TableSizeInfo[]> {
  return [];
}
