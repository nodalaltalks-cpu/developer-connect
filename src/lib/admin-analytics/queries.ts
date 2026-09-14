import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../developer-connect/db/client.ts";
import { createPostgresRepositories } from "../developer-connect/db/postgres-repository.ts";
import {
  developers,
  websiteCandidates,
  verificationEvents,
  analyticsEvents,
  profiles,
  evidence,
  notifications,
  developerEditEvents,
} from "../developer-connect/db/schema.ts";
import { PROFILE_FIELD_CONFIG, PROFILE_SECTIONS } from "../profile/field-config.ts";
import { PENDING_REVIEW_STATUSES } from "../developer-connect/verification-queue-state.ts";
import { calculateProfileCompletion } from "../profile/completion.ts";
import { computeRate } from "./rate.ts";
import { comparePeriods, MIN_SAMPLE_FOR_COMPARISON } from "./period-comparison.ts";
import type {
  ExecutiveOverview,
  SearchIntelligence,
  SearchBehaviorStats,
  DeveloperStat,
  VerificationOperations,
  DataQuality,
  AuditLogEntry,
  AiReadiness,
  UserAndProfileIntelligence,
  EngagementByCompletion,
  VerificationOpportunity,
  DeveloperIntelligenceQuery,
  DeveloperIntelligencePage,
  ConversionStep,
  UserSegment,
  UserSegmentCount,
  UserBehaviorIntelligence,
  RetentionMetrics,
  RetentionWindow,
  UserActivityEvent,
  DeveloperVerificationBreakdown,
  InfrastructureEntityCounts,
  TableSizeInfo,
  ActivityBand,
} from "./types.ts";

/**
 * Founder-dashboard metrics — the single source of truth for every metric
 * definition the dashboard displays. Every function documents: what it
 * measures, which events/tables it reads, its time window, and its known
 * limitations — so no two dashboard sections can silently disagree about
 * what "a search" or "a verified developer" means.
 *
 * Read-only. Nothing here ever mutates developer or verification state —
 * all writes still go exclusively through developer-connect's
 * verification-service.ts, unchanged.
 */

type EventName = (typeof analyticsEvents.$inferSelect)["eventName"];

function buildFunnel(steps: { label: string; count: number }[]): ConversionStep[] {
  return steps.map((step, i) => ({
    label: step.label,
    count: step.count,
    conversionFromPrevious: i === 0 ? null : computeRate(step.count, steps[i - 1].count),
  }));
}

async function countRows(where?: SQL): Promise<number> {
  const db = getDb();
  const query = db.select({ n: count() }).from(analyticsEvents);
  const [row] = where ? await query.where(where) : await query;
  return row?.n ?? 0;
}

async function countEventsInRange(eventNames: EventName[], start: Date, end: Date): Promise<number> {
  return countRows(
    and(
      inArray(analyticsEvents.eventName, eventNames),
      gte(analyticsEvents.occurredAt, start),
      lt(analyticsEvents.occurredAt, end),
    ),
  );
}

/** Last 7 days vs the 7 days before that — a fixed, documented window, not user-configurable (yet). */
async function compareLastSevenDays(eventNames: EventName[]) {
  const now = new Date();
  const periodMs = 7 * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - periodMs);
  const previousStart = new Date(now.getTime() - 2 * periodMs);

  const current = await countEventsInRange(eventNames, currentStart, now);
  const previous = await countEventsInRange(eventNames, previousStart, currentStart);
  return comparePeriods(current, previous);
}

/**
 * Definition: platform-wide snapshot of directory size, verification
 * pipeline state, and the search→click funnel, plus the North Star
 * (official website clicks) and its 7-day trend.
 * Source: developers, website_candidates, analytics_events, profiles.
 * Window: status counts and the funnel are all-time (cumulative); the two
 * *Comparison fields are the last 7 days vs the 7 days before, and report
 * "insufficient data" honestly rather than a misleading percentage when
 * volume is too low (see period-comparison.ts).
 * Limitation: `activeUsers` counts distinct authenticated user ids seen
 * in analytics_events, not Clerk's total signup count — someone who
 * signed up but never triggered a tracked event won't be counted.
 */
export async function getExecutiveOverview(): Promise<ExecutiveOverview> {
  const db = getDb();

  const [developersTracked] = await db.select({ n: count() }).from(developers);
  const [verifiedDevelopers] = await db
    .select({ n: count() })
    .from(websiteCandidates)
    .where(eq(websiteCandidates.verificationStatus, "VERIFIED"));
  // BUG FIX (see the "Pending verification" audit): this previously
  // matched only the exact "PENDING_VERIFICATION" status, silently
  // excluding every candidate still sitting at "DISCOVERED" — which is
  // most of the /admin/verification queue in practice, since a fresh
  // discovery only advances to PENDING_VERIFICATION via an explicit
  // "mark ready for review" step most founder actions skip straight past
  // (see markReadyForReview in verification-service.ts). That mismatch is
  // exactly why this tile could read 0 while the queue was full. Now
  // reads from PENDING_REVIEW_STATUSES, the same shared definition
  // verification-queue-state.ts uses, so this tile and the queue can
  // never drift apart again.
  const [pendingVerification] = await db
    .select({ n: count() })
    .from(websiteCandidates)
    .where(inArray(websiteCandidates.verificationStatus, [...PENDING_REVIEW_STATUSES]));
  const [needsReverification] = await db
    .select({ n: count() })
    .from(websiteCandidates)
    .where(eq(websiteCandidates.verificationStatus, "NEEDS_REVERIFICATION"));

  const successfulSearches = await countRows(eq(analyticsEvents.eventName, "search_performed"));
  const zeroResultSearches = await countRows(eq(analyticsEvents.eventName, "zero_result_search"));
  const searchResultClicks = await countRows(eq(analyticsEvents.eventName, "search_result_clicked"));
  const developerPageViews = await countRows(eq(analyticsEvents.eventName, "developer_page_viewed"));
  const officialWebsiteClicks = await countRows(eq(analyticsEvents.eventName, "official_website_clicked"));
  const totalSearches = successfulSearches + zeroResultSearches;

  const [activeUsersRow] = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.userId})` })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.userId} is not null`);
  const [profilesStartedRow] = await db.select({ n: count() }).from(profiles);

  const [mobileRow] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.payload}->>'deviceType' = 'mobile'`);
  const [deviceKnownRow] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.payload}->>'deviceType' is not null`);

  const [searchVolumeComparison, officialWebsiteClicksComparison] = await Promise.all([
    compareLastSevenDays(["search_performed", "zero_result_search"]),
    compareLastSevenDays(["official_website_clicked"]),
  ]);

  return {
    developersTracked: developersTracked?.n ?? 0,
    verifiedDevelopers: verifiedDevelopers?.n ?? 0,
    pendingVerification: pendingVerification?.n ?? 0,
    needsReverification: needsReverification?.n ?? 0,
    totalSearches,
    successfulSearches,
    zeroResultSearches,
    developerPageViews,
    officialWebsiteClicks,
    activeUsers: Number(activeUsersRow?.n ?? 0),
    profilesStarted: profilesStartedRow?.n ?? 0,
    mobileShare: computeRate(mobileRow?.n ?? 0, deviceKnownRow?.n ?? 0),
    northStarConversion: computeRate(officialWebsiteClicks, totalSearches),
    funnel: buildFunnel([
      { label: "Searches", count: totalSearches },
      { label: "Results clicked", count: searchResultClicks },
      { label: "Developer pages viewed", count: developerPageViews },
      { label: "Official website clicks", count: officialWebsiteClicks },
    ]),
    searchVolumeComparison,
    officialWebsiteClicksComparison,
  };
}

/**
 * Definition: what people search for, and — most importantly — which
 * searches return nothing (a direct, honest proxy for "high demand, no
 * verified website yet," since a zero-result query means exactly that).
 * Source: analytics_events (search_performed, zero_result_search).
 * Window: all-time. Limitation: query text is grouped case-insensitively
 * but not otherwise normalized (no typo/synonym clustering).
 */
export async function getSearchIntelligence(): Promise<SearchIntelligence> {
  const db = getDb();
  const queryText = sql<string>`lower(${analyticsEvents.payload}->>'query')`;

  const topQueries = await db
    .select({ query: queryText.as("query"), count: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventName, "search_performed"))
    .groupBy(queryText)
    .orderBy(desc(count()))
    .limit(10);

  const highDemandUnverified = await db
    .select({ query: queryText.as("query"), count: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventName, "zero_result_search"))
    .groupBy(queryText)
    .orderBy(desc(count()))
    .limit(10);

  const [uniqueRow] = await db
    .select({ n: sql<number>`count(distinct ${queryText})` })
    .from(analyticsEvents)
    .where(
      sql`${analyticsEvents.eventName} in ('search_performed', 'zero_result_search')`,
    );

  const totalSearches =
    (await countRows(eq(analyticsEvents.eventName, "search_performed"))) +
    (await countRows(eq(analyticsEvents.eventName, "zero_result_search")));

  const searchBehavior = await getSearchBehaviorStats(db);

  return {
    totalSearches,
    uniqueQueries: Number(uniqueRow?.n ?? 0),
    topQueries,
    highDemandUnverified,
    searchBehavior,
  };
}

/**
 * Definition: per-session search patterns, never a per-query aggregate —
 * "repeated" means the SAME session tried the same query again;
 * "refined" means the same session tried more than one distinct query.
 * Both are real signals of how people search, not just what they search
 * for. Source: search_performed + zero_result_search, grouped by
 * session_id. Window: all-time.
 */
async function getSearchBehaviorStats(db: ReturnType<typeof getDb>): Promise<SearchBehaviorStats> {
  const result = await db.execute<{
    searching_sessions: string;
    repeated_search_sessions: string;
    refined_search_sessions: string;
  }>(sql`
    with session_queries as (
      select session_id, lower(payload->>'query') as query
      from ${analyticsEvents}
      where event_name in ('search_performed', 'zero_result_search')
    ),
    per_session as (
      select session_id, count(*) as total, count(distinct query) as distinct_queries
      from session_queries
      group by session_id
    )
    select
      count(*) as searching_sessions,
      count(*) filter (where total > distinct_queries) as repeated_search_sessions,
      count(*) filter (where distinct_queries > 1) as refined_search_sessions
    from per_session
  `);
  const row = result.rows[0];

  return {
    searchingSessions: Number(row?.searching_sessions ?? 0),
    repeatedSearchSessions: Number(row?.repeated_search_sessions ?? 0),
    refinedSearchSessions: Number(row?.refined_search_sessions ?? 0),
  };
}

/**
 * Definition: every zero-result search, cross-referenced against the real
 * developer directory — never a synthesized "demand score." Each query
 * lands in exactly one honest bucket:
 *   NOT_INDEXED        — no developer record matches this name at all
 *   INDEXED_UNVERIFIED — a developer record exists but has no verified site
 *   INDEXED_VERIFIED   — a developer record exists and IS verified (the
 *                        search likely just didn't match the stored name —
 *                        a data/matching issue, not a verification gap)
 * Source: getSearchIntelligence()'s zero-result queries, joined against
 * developers.search() (the same lookup the public search box uses) and
 * getVerifiedForDeveloper() — both existing repository methods, no new
 * matching logic invented for this.
 * Window: all-time (inherits from getSearchIntelligence).
 * Limitation: one directory lookup per distinct query (top 10 max) — fine
 * at current volume.
 */
export async function getHighPriorityVerificationOpportunities(): Promise<VerificationOpportunity[]> {
  const search = await getSearchIntelligence();
  const repos = createPostgresRepositories();

  const opportunities: VerificationOpportunity[] = [];
  for (const row of search.highDemandUnverified) {
    const matches = await repos.developers.search(row.query, 1);
    const developer = matches[0] ?? null;

    if (!developer) {
      opportunities.push({
        query: row.query,
        searchCount: row.count,
        status: "NOT_INDEXED",
        developer: null,
      });
      continue;
    }

    const verified = await repos.candidates.getVerifiedForDeveloper(developer.id);
    opportunities.push({
      query: row.query,
      searchCount: row.count,
      status: verified ? "INDEXED_VERIFIED" : "INDEXED_UNVERIFIED",
      developer: { id: developer.id, displayName: developer.displayName, slug: developer.slug },
    });
  }

  return opportunities;
}

const DEFAULT_DEVELOPER_PAGE_SIZE = 25;

/** Escapes ILIKE wildcard/escape characters so search input matches literally, not as a pattern — mirrors the same helper in postgres-repository.ts. */
function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The real, granular verification-status values a developer's status
 * filter may request directly (as opposed to "ALL"/"NOT_VERIFIED", which
 * are composite filters over these). Matches verificationStatusEnum in
 * schema.ts exactly — no state is invented here.
 */
const GRANULAR_VERIFICATION_STATUSES = [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "NEEDS_REVERIFICATION",
  "INACTIVE",
] as const;

/**
 * A developer's *effective* verification status — the source of truth is
 * the candidate lifecycle (website_candidates.verification_status), not
 * any field on developers itself (there is none). A developer can have
 * several website candidates at once (a rejected one and a fresh
 * resubmission, a verified one and a superseded/inactive one, etc.), each
 * independently at its own point in the state machine
 * (lifecycle.ts/verification-service.ts), so "the" developer-level status
 * is the single most currently-relevant candidate status, in this
 * precedence order (most urgent/current first):
 *   VERIFIED > NEEDS_REVERIFICATION > PENDING_VERIFICATION > DISCOVERED
 *   > REJECTED > INACTIVE
 * This matches how a founder actually thinks about it: an active verified
 * site, or one flagged for re-check, or one awaiting a decision, always
 * outranks a candidate whose lifecycle already ended (REJECTED/INACTIVE) —
 * e.g. a developer with one REJECTED candidate and one brand-new
 * resubmission is correctly DISCOVERED, not REJECTED. A developer with no
 * website candidate at all (the developer record was created but the
 * "Add website" step failed or hasn't happened yet — a real, reachable
 * state, see createDeveloperAction) is treated as DISCOVERED, matching the
 * column's own default value for "nothing has happened yet."
 * This is read-only: it never writes to website_candidates, and it does
 * not change what "VERIFIED" means for public visibility, which still
 * comes exclusively from getVerifiedForDeveloper()/search-service.ts.
 */
function effectiveVerificationStatusSql() {
  const db = getDb();
  // Built via the query builder (not a hand-written correlated `sql`
  // fragment) so Drizzle fully table-qualifies every column reference —
  // when this same correlation is written as raw sql and used directly as
  // a SELECT-projection value (rather than inside a WHERE clause), Drizzle
  // renders `developers.id` unqualified, and Postgres silently resolves it
  // to website_candidates' OWN "id" column instead (since that name exists
  // in the subquery's own scope too), making the correlation always false.
  const priority = sql`case ${websiteCandidates.verificationStatus}
    when 'VERIFIED' then 1
    when 'NEEDS_REVERIFICATION' then 2
    when 'PENDING_VERIFICATION' then 3
    when 'DISCOVERED' then 4
    when 'REJECTED' then 5
    when 'INACTIVE' then 6
  end`;
  const subquery = db
    .select({ status: websiteCandidates.verificationStatus })
    .from(websiteCandidates)
    .where(eq(websiteCandidates.developerId, developers.id))
    .orderBy(priority)
    .limit(1);
  return sql<string>`coalesce((${subquery}), 'DISCOVERED')`;
}

/**
 * Definition: per-developer attention and conversion, for ACTIVE
 * developers only, one page at a time.
 * Source: developers (identity, search: display/legal name),
 * website_candidates (verification status, search: canonical domain),
 * analytics_events (search_result_clicked, developer_page_viewed,
 * official_website_clicked).
 * Window: all-time.
 *
 * Pagination and search/status filtering happen in SQL — `search` matches
 * display name, legal name, or any of the developer's website-candidate
 * domains (past or present, not just the verified one), and `totalCount`
 * reflects the full filtered set, not just this page. Ordered by display
 * name (then id as a tiebreaker) for stable, deterministic paging.
 *
 * `status` accepts "ALL", the composite "VERIFIED"/"NOT_VERIFIED"
 * filters, or any of GRANULAR_VERIFICATION_STATUSES — each backed by the
 * real candidate-lifecycle data via effectiveVerificationStatusSql(), not
 * a stale or invented field. See that function's doc comment for exactly
 * how a developer's single effective status is derived when it has
 * multiple website candidates.
 *
 * Limitation: `searchResultClicks`/`pageViews`/`officialWebsiteClicks` are
 * still one extra round trip each per developer — bounded by `pageSize`
 * now (25 by default) rather than by the whole table, which is what
 * keeps this affordable as the developer count grows into the hundreds.
 */
export async function getDeveloperIntelligence(
  query: DeveloperIntelligenceQuery = {},
): Promise<DeveloperIntelligencePage> {
  const db = getDb();
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_DEVELOPER_PAGE_SIZE;
  const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
  const status = query.status ?? "ALL";
  const searchTerm = query.search?.trim();

  const conditions = [eq(developers.status, "ACTIVE")];

  if (searchTerm) {
    const pattern = `%${escapeLikePattern(searchTerm)}%`;
    conditions.push(
      or(
        ilike(developers.displayName, pattern),
        ilike(developers.legalName, pattern),
        sql`exists (
          select 1 from ${websiteCandidates}
          where ${websiteCandidates.developerId} = ${developers.id}
            and ${websiteCandidates.canonicalDomain} ilike ${pattern}
        )`,
      )!,
    );
  }

  if (status === "VERIFIED") {
    conditions.push(sql`exists (
      select 1 from ${websiteCandidates}
      where ${websiteCandidates.developerId} = ${developers.id}
        and ${websiteCandidates.verificationStatus} = 'VERIFIED'
    )`);
  } else if (status === "NOT_VERIFIED") {
    conditions.push(sql`not exists (
      select 1 from ${websiteCandidates}
      where ${websiteCandidates.developerId} = ${developers.id}
        and ${websiteCandidates.verificationStatus} = 'VERIFIED'
    )`);
  } else if ((GRANULAR_VERIFICATION_STATUSES as readonly string[]).includes(status)) {
    conditions.push(sql`${effectiveVerificationStatusSql()} = ${status}`);
  } else if (status !== "ALL") {
    // An unrecognized status value (e.g. a stale/hand-edited URL) matches
    // nothing rather than silently falling back to "ALL".
    conditions.push(sql`false`);
  }

  const whereClause = and(...conditions);

  const [{ n: totalCount }] = await db
    .select({ n: count() })
    .from(developers)
    .where(whereClause);

  const rows = await db
    .select({
      developerId: developers.id,
      displayName: developers.displayName,
      slug: developers.slug,
      verificationStatus: effectiveVerificationStatusSql(),
      hasPendingChanges: sql<boolean>`${isNotNull(developers.pendingChanges)}`,
    })
    .from(developers)
    .where(whereClause)
    .orderBy(asc(developers.displayName), asc(developers.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const stats: DeveloperStat[] = [];
  for (const row of rows) {
    const searchResultClicks = await countRows(
      and(
        eq(analyticsEvents.eventName, "search_result_clicked"),
        eq(analyticsEvents.developerId, row.developerId),
      ),
    );
    const pageViews = await countRows(
      and(
        eq(analyticsEvents.eventName, "developer_page_viewed"),
        eq(analyticsEvents.developerId, row.developerId),
      ),
    );
    const clicks = await countRows(
      and(
        eq(analyticsEvents.eventName, "official_website_clicked"),
        eq(analyticsEvents.developerId, row.developerId),
      ),
    );

    stats.push({
      developerId: row.developerId,
      displayName: row.displayName,
      slug: row.slug,
      verificationStatus: row.verificationStatus,
      hasPendingChanges: row.hasPendingChanges,
      searchResultClicks,
      pageViews,
      officialWebsiteClicks: clicks,
      ctr: computeRate(clicks, pageViews),
    });
  }

  return { developers: stats, totalCount, page, pageSize };
}

/**
 * Definition: real-time counts of every website candidate by status —
 * this is the founder's actual to-do list — plus average turnaround from
 * a candidate's creation to its VERIFIED decision.
 * Source: website_candidates (status counts), verification_events
 * (turnaround, using each candidate's first event as "created" and its
 * transition into VERIFIED as "decided").
 * Window: all-time.
 */
export async function getVerificationOperations(): Promise<VerificationOperations> {
  const db = getDb();
  const statusCounts = await db
    .select({ status: websiteCandidates.verificationStatus, n: count() })
    .from(websiteCandidates)
    .groupBy(websiteCandidates.verificationStatus);

  const byStatus = Object.fromEntries(statusCounts.map((row) => [row.status, row.n]));

  const turnaroundResult = await db.execute<{ avg_hours: string | null }>(sql`
    select avg(extract(epoch from (verified.created_at - created.created_at)) / 3600.0) as avg_hours
    from ${verificationEvents} verified
    join ${verificationEvents} created
      on created.website_candidate_id = verified.website_candidate_id
    where verified.new_status = 'VERIFIED'
      and created.previous_status is null
  `);
  const turnaroundRow = turnaroundResult.rows[0];

  return {
    discovered: byStatus.DISCOVERED ?? 0,
    pendingVerification: byStatus.PENDING_VERIFICATION ?? 0,
    verified: byStatus.VERIFIED ?? 0,
    rejected: byStatus.REJECTED ?? 0,
    needsReverification: byStatus.NEEDS_REVERIFICATION ?? 0,
    inactive: byStatus.INACTIVE ?? 0,
    averageTurnaroundHours:
      turnaroundRow?.avg_hours != null ? Math.round(Number(turnaroundRow.avg_hours) * 10) / 10 : null,
  };
}

/**
 * Definition: structural signals worth the founder's attention that
 * aren't captured by the verification status counts alone.
 * Source: developers, website_candidates, evidence.
 * Window: all-time.
 */
export async function getDataQuality(): Promise<DataQuality> {
  const db = getDb();

  const withoutVerifiedResult = await db.execute<{ n: string }>(sql`
    select count(*) as n from ${developers} d
    where d.status = 'ACTIVE'
      and not exists (
        select 1 from ${websiteCandidates} wc
        where wc.developer_id = d.id and wc.verification_status = 'VERIFIED'
      )
  `);
  const withoutVerified = withoutVerifiedResult.rows[0];

  const noEvidenceResult = await db.execute<{ n: string }>(sql`
    select count(*) as n from ${websiteCandidates} wc
    where wc.verification_status in ('DISCOVERED', 'PENDING_VERIFICATION')
      and not exists (select 1 from ${evidence} e where e.website_candidate_id = wc.id)
  `);
  const noEvidence = noEvidenceResult.rows[0];

  const [staleVerified] = await db
    .select({ n: count() })
    .from(websiteCandidates)
    .where(
      and(
        eq(websiteCandidates.verificationStatus, "VERIFIED"),
        sql`${websiteCandidates.lastCheckedAt} is null`,
      ),
    );

  return {
    developersWithoutVerifiedWebsite: Number(withoutVerified?.n ?? 0),
    candidatesWithNoEvidence: Number(noEvidence?.n ?? 0),
    verifiedNeverReChecked: staleVerified?.n ?? 0,
  };
}

/**
 * Definition: the complete, real, immutable verification history —
 * every status transition ever recorded, newest first.
 * Source: verification_events joined to website_candidates/developers for
 * display context. This is the actual audit_log the schema's append-only
 * trigger (Phase 2B.1) guarantees can never be edited after the fact.
 */
export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: verificationEvents.id,
      candidateId: verificationEvents.websiteCandidateId,
      developerName: developers.displayName,
      previousStatus: verificationEvents.previousStatus,
      newStatus: verificationEvents.newStatus,
      reason: verificationEvents.reason,
      actorType: verificationEvents.actorType,
      actorId: verificationEvents.actorId,
      createdAt: verificationEvents.createdAt,
    })
    .from(verificationEvents)
    .leftJoin(websiteCandidates, eq(websiteCandidates.id, verificationEvents.websiteCandidateId))
    .leftJoin(developers, eq(developers.id, websiteCandidates.developerId))
    .orderBy(desc(verificationEvents.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Definition: readiness of the underlying datasets for future ranking,
 * recommendation, or verification-classification work — counts only, no
 * model, no prediction, no claim of intelligence.
 * Source: verification_events (labeled founder decisions), analytics_events
 * (behavioural volume + query coverage), PROFILE_FIELD_CONFIG (explicit
 * preference availability — currently 0, honestly, since no fields exist).
 */
export async function getAiReadiness(): Promise<AiReadiness> {
  const db = getDb();

  const [labeledDecisions] = await db
    .select({ n: count() })
    .from(verificationEvents)
    .where(eq(verificationEvents.actorType, "FOUNDER"));

  const totalSearchEvents =
    (await countRows(eq(analyticsEvents.eventName, "search_performed"))) +
    (await countRows(eq(analyticsEvents.eventName, "zero_result_search")));
  const zeroResultQueries = await countRows(eq(analyticsEvents.eventName, "zero_result_search"));

  const queryText = sql<string>`lower(${analyticsEvents.payload}->>'query')`;
  const [distinctQueriesRow] = await db
    .select({ n: sql<number>`count(distinct ${queryText})` })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} in ('search_performed', 'zero_result_search')`);

  const [totalEventsRow] = await db.select({ n: count() }).from(analyticsEvents);

  return {
    labeledVerificationDecisions: labeledDecisions?.n ?? 0,
    totalSearchEvents,
    distinctSearchQueries: Number(distinctQueriesRow?.n ?? 0),
    zeroResultQueries,
    totalBehaviourEvents: totalEventsRow?.n ?? 0,
    profileFieldsConfigured: PROFILE_FIELD_CONFIG.length,
  };
}

/**
 * Definition: aggregate session/user activity and profile-completion
 * distribution. No individual profile answers are ever surfaced here —
 * only counts and an average.
 * Source: analytics_events (sessions, authenticated users), profiles
 * (completion, computed fresh via calculateProfileCompletion — never a
 * stored/stale percentage).
 * Window: all-time.
 */
function completionBucketLabel(percentage: number): string {
  if (percentage >= 100) return "100%";
  if (percentage >= 76) return "76–99%";
  if (percentage >= 51) return "51–75%";
  if (percentage >= 26) return "26–50%";
  return "0–25%";
}

const COMPLETION_BUCKET_LABELS = ["0–25%", "26–50%", "51–75%", "76–99%", "100%"];

/** Documented, fixed thresholds — never derived from a statistical test, same spirit as MIN_SAMPLE_FOR_COMPARISON. */
function dropOffLevel(percent: number): "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" {
  if (percent >= 80) return "LOW";
  if (percent >= 60) return "MEDIUM";
  if (percent >= 40) return "HIGH";
  return "VERY_HIGH";
}

const ENGAGEMENT_EVENT_NAMES = [
  "search_performed",
  "developer_page_viewed",
  "official_website_clicked",
] as const;

export async function getUserAndProfileIntelligence(): Promise<UserAndProfileIntelligence> {
  const db = getDb();

  const [sessionsRow] = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.sessionId})` })
    .from(analyticsEvents);
  const [usersRow] = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.userId})` })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.userId} is not null`);
  const [profilesRow] = await db.select({ n: count() }).from(profiles);

  const distinctSessions = Number(sessionsRow?.n ?? 0);
  const distinctAuthenticatedUsers = Number(usersRow?.n ?? 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newProfilesRow] = await db
    .select({ n: count() })
    .from(profiles)
    .where(gte(profiles.createdAt, sevenDaysAgo));
  const [activeProfilesRow] = await db
    .select({ n: count() })
    .from(profiles)
    .where(gte(profiles.updatedAt, sevenDaysAgo));

  const allProfiles = await db.select({ userId: profiles.userId, data: profiles.data }).from(profiles);
  const completions = allProfiles.map((row) => ({
    userId: row.userId,
    completion: calculateProfileCompletion(row.data as Record<string, unknown>),
  }));
  const percentages = completions
    .map((c) => c.completion.percentage)
    .filter((value): value is number => value !== null);
  const averageCompletionPercent =
    percentages.length > 0
      ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 10) / 10
      : null;

  const completionDistribution: CompletionBucketAccumulator = Object.fromEntries(
    COMPLETION_BUCKET_LABELS.map((label) => [label, 0]),
  );
  for (const percentage of percentages) {
    completionDistribution[completionBucketLabel(percentage)] += 1;
  }

  const sectionCompletion = PROFILE_SECTIONS.map((section) => {
    const completeCount = completions.filter((c) =>
      c.completion.sections.find((s) => s.sectionId === section.id)?.complete,
    ).length;
    const rate = computeRate(completeCount, percentages.length);
    return {
      sectionId: section.id,
      title: section.title,
      completionRate: rate,
      dropOff:
        percentages.length >= MIN_SAMPLE_FOR_COMPARISON && rate.percent !== null
          ? dropOffLevel(rate.percent)
          : null,
    };
  });

  let engagementByCompletion: EngagementByCompletion[] = [];
  if (PROFILE_FIELD_CONFIG.length > 0) {
    const engagementRows = await db
      .select({ userId: analyticsEvents.userId, eventName: analyticsEvents.eventName, n: count() })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.userId} is not null`,
          inArray(analyticsEvents.eventName, [...ENGAGEMENT_EVENT_NAMES]),
        ),
      )
      .groupBy(analyticsEvents.userId, analyticsEvents.eventName);

    const eventCountsByUser = new Map<string, Map<string, number>>();
    for (const row of engagementRows) {
      if (!row.userId) continue;
      const byEvent = eventCountsByUser.get(row.userId) ?? new Map<string, number>();
      byEvent.set(row.eventName, row.n);
      eventCountsByUser.set(row.userId, byEvent);
    }

    const higherGroup = completions.filter((c) => (c.completion.percentage ?? 0) >= 50);
    const lowerGroup = completions.filter((c) => (c.completion.percentage ?? 0) < 50);

    const metricKey: Record<(typeof ENGAGEMENT_EVENT_NAMES)[number], EngagementByCompletion["metric"]> = {
      search_performed: "searches",
      developer_page_viewed: "developerPageViews",
      official_website_clicked: "officialWebsiteClicks",
    };

    engagementByCompletion = ENGAGEMENT_EVENT_NAMES.map((eventName) => {
      const average = (group: typeof completions) =>
        group.length > 0
          ? group.reduce((sum, c) => sum + (eventCountsByUser.get(c.userId)?.get(eventName) ?? 0), 0) /
            group.length
          : null;

      return {
        metric: metricKey[eventName],
        higherCompletionAverage: average(higherGroup) !== null ? Math.round(average(higherGroup)! * 10) / 10 : null,
        lowerCompletionAverage: average(lowerGroup) !== null ? Math.round(average(lowerGroup)! * 10) / 10 : null,
        higherGroupSize: higherGroup.length,
        lowerGroupSize: lowerGroup.length,
        sufficientData:
          higherGroup.length >= MIN_SAMPLE_FOR_COMPARISON && lowerGroup.length >= MIN_SAMPLE_FOR_COMPARISON,
      };
    });
  }

  return {
    distinctSessions,
    distinctAuthenticatedUsers,
    sessionsPerUser:
      distinctAuthenticatedUsers > 0
        ? Math.round((distinctSessions / distinctAuthenticatedUsers) * 10) / 10
        : null,
    profilesStarted: profilesRow?.n ?? 0,
    newProfilesLast7Days: newProfilesRow?.n ?? 0,
    activeProfilesLast7Days: activeProfilesRow?.n ?? 0,
    profileFieldsConfigured: PROFILE_FIELD_CONFIG.length,
    averageCompletionPercent,
    completionDistribution: COMPLETION_BUCKET_LABELS.map((label) => ({
      label,
      count: completionDistribution[label],
    })),
    sectionCompletion,
    engagementByCompletion,
  };
}

type CompletionBucketAccumulator = Record<string, number>;

/**
 * Definition: deterministic, rule-based session tags (Part 8 of the Phase
 * 3C brief) — never an inferred or AI-generated classification. A session
 * can match more than one tag; these are independent signals read off the
 * existing event stream, not a strict partition. Source: analytics_events,
 * grouped by session_id (the same long-lived, 1-year session cookie used
 * everywhere else — see session.ts). Window: all-time.
 */
export async function getUserBehaviorIntelligence(): Promise<UserBehaviorIntelligence> {
  const db = getDb();

  const [sessionsRow] = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.sessionId})` })
    .from(analyticsEvents);
  const distinctSessions = Number(sessionsRow?.n ?? 0);

  const searchCount = await countRows(
    sql`${analyticsEvents.eventName} in ('search_performed', 'zero_result_search')`,
  );
  const pageViewCount = await countRows(eq(analyticsEvents.eventName, "developer_page_viewed"));
  const clickCount = await countRows(eq(analyticsEvents.eventName, "official_website_clicked"));

  const [mobileRow] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.payload}->>'deviceType' = 'mobile'`);
  const [deviceKnownRow] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(
      sql`${analyticsEvents.payload}->>'deviceType' is not null and ${analyticsEvents.payload}->>'deviceType' != 'unknown'`,
    );

  const segmentResult = await db.execute<{
    new_sessions: string;
    returning_sessions: string;
    high_intent_sessions: string;
    researching_sessions: string;
    zero_result_only_sessions: string;
  }>(sql`
    with session_summary as (
      select
        session_id,
        count(distinct occurred_at::date) as distinct_days,
        bool_or(event_name = 'official_website_clicked') as has_click,
        bool_or(event_name = 'developer_page_viewed') as has_page_view,
        bool_or(event_name = 'search_performed') as has_successful_search,
        bool_or(event_name = 'zero_result_search') as has_zero_result_search
      from ${analyticsEvents}
      group by session_id
    )
    select
      count(*) filter (where distinct_days = 1) as new_sessions,
      count(*) filter (where distinct_days > 1) as returning_sessions,
      count(*) filter (where has_click) as high_intent_sessions,
      count(*) filter (where has_page_view and not has_click) as researching_sessions,
      count(*) filter (where has_zero_result_search and not has_successful_search) as zero_result_only_sessions
    from session_summary
  `);
  const s = segmentResult.rows[0];

  const segmentDefinitions: Record<UserSegment, string> = {
    NEW: "All of this session's activity happened on a single calendar day.",
    RETURNING: "This session has activity on more than one calendar day.",
    HIGH_INTENT: "This session reached at least one official-website click.",
    RESEARCHING: "This session viewed at least one developer page but hasn't clicked an official website yet.",
    ZERO_RESULT_ONLY: "Every search this session made returned zero results — never a single successful search.",
  };
  const segmentCounts: Record<UserSegment, number> = {
    NEW: Number(s?.new_sessions ?? 0),
    RETURNING: Number(s?.returning_sessions ?? 0),
    HIGH_INTENT: Number(s?.high_intent_sessions ?? 0),
    RESEARCHING: Number(s?.researching_sessions ?? 0),
    ZERO_RESULT_ONLY: Number(s?.zero_result_only_sessions ?? 0),
  };
  const segments: UserSegmentCount[] = (Object.keys(segmentDefinitions) as UserSegment[]).map((segment) => ({
    segment,
    count: segmentCounts[segment],
    definition: segmentDefinitions[segment],
  }));

  return {
    distinctSessions,
    avgSearchesPerSession: distinctSessions > 0 ? Math.round((searchCount / distinctSessions) * 10) / 10 : null,
    avgDeveloperPageViewsPerSession:
      distinctSessions > 0 ? Math.round((pageViewCount / distinctSessions) * 10) / 10 : null,
    avgOfficialWebsiteClicksPerSession:
      distinctSessions > 0 ? Math.round((clickCount / distinctSessions) * 10) / 10 : null,
    mobileShare: computeRate(mobileRow?.n ?? 0, deviceKnownRow?.n ?? 0),
    segments,
  };
}

/**
 * Definition: "returned within N days" — simple, explainable retention,
 * deliberately not a full day-exact cohort grid (Part 10 explicitly warns
 * against building unnecessary cohort-analysis complexity). A session is
 * "eligible" for a window once its first-ever event is at least that many
 * days in the past — otherwise there hasn't been time to observe a
 * return yet, and it's excluded rather than counted as churned.
 * Source: analytics_events, grouped by session_id. Window: all-time
 * (eligibility is what keeps this honest, not a date filter).
 */
export async function getRetentionMetrics(): Promise<RetentionMetrics> {
  const db = getDb();

  async function retentionWindow(windowDays: 1 | 7 | 30): Promise<RetentionWindow> {
    const result = await db.execute<{ eligible: string; returned: string }>(sql`
      with session_first as (
        select session_id, min(occurred_at) as first_seen
        from ${analyticsEvents}
        group by session_id
      )
      select
        count(*) filter (where first_seen <= now() - interval '${sql.raw(String(windowDays))} days') as eligible,
        count(*) filter (
          where first_seen <= now() - interval '${sql.raw(String(windowDays))} days'
          and exists (
            select 1 from ${analyticsEvents} ae
            where ae.session_id = session_first.session_id
              and ae.occurred_at > session_first.first_seen + interval '1 hour'
              and ae.occurred_at <= session_first.first_seen + interval '${sql.raw(String(windowDays))} days'
          )
        ) as returned
      from session_first
    `);
    const row = result.rows[0];
    const eligible = Number(row?.eligible ?? 0);
    const returned = Number(row?.returned ?? 0);
    return { windowDays, eligibleSessions: eligible, rate: computeRate(returned, eligible) };
  }

  const [d1, d7, d30] = await Promise.all([retentionWindow(1), retentionWindow(7), retentionWindow(30)]);

  const clickComparisonResult = await db.execute<{
    clicked_eligible: string;
    clicked_returned: string;
    not_clicked_eligible: string;
    not_clicked_returned: string;
  }>(sql`
    with session_first as (
      select session_id, min(occurred_at) as first_seen
      from ${analyticsEvents}
      group by session_id
    ),
    session_click as (
      select session_id, bool_or(event_name = 'official_website_clicked') as has_click
      from ${analyticsEvents}
      group by session_id
    ),
    joined as (
      select sf.session_id, sf.first_seen, sc.has_click,
        exists (
          select 1 from ${analyticsEvents} ae
          where ae.session_id = sf.session_id
            and ae.occurred_at > sf.first_seen + interval '1 hour'
            and ae.occurred_at <= sf.first_seen + interval '7 days'
        ) as returned
      from session_first sf
      join session_click sc on sc.session_id = sf.session_id
      where sf.first_seen <= now() - interval '7 days'
    )
    select
      count(*) filter (where has_click) as clicked_eligible,
      count(*) filter (where has_click and returned) as clicked_returned,
      count(*) filter (where not has_click) as not_clicked_eligible,
      count(*) filter (where not has_click and returned) as not_clicked_returned
    from joined
  `);
  const c = clickComparisonResult.rows[0];
  const clickedEligible = Number(c?.clicked_eligible ?? 0);
  const notClickedEligible = Number(c?.not_clicked_eligible ?? 0);

  return {
    windows: [d1, d7, d30],
    returnByOfficialWebsiteClick: {
      clicked: computeRate(Number(c?.clicked_returned ?? 0), clickedEligible),
      didNotClick: computeRate(Number(c?.not_clicked_returned ?? 0), notClickedEligible),
      sufficientData:
        clickedEligible >= MIN_SAMPLE_FOR_COMPARISON && notClickedEligible >= MIN_SAMPLE_FOR_COMPARISON,
    },
  };
}

/**
 * A real, chronological read of this one user's own analytics_events rows
 * — nothing invented, nothing aggregated away. Used only by the
 * founder-only individual user admin page (Part 25). Joins developers
 * only to turn a developerId into a human-readable name; never exposes
 * internal verification fields.
 */
export async function getUserActivityTimeline(
  userId: string,
  limit = 50,
): Promise<UserActivityEvent[]> {
  const db = getDb();
  const rows = await db
    .select({
      eventName: analyticsEvents.eventName,
      occurredAt: analyticsEvents.occurredAt,
      payload: analyticsEvents.payload,
      developerName: developers.displayName,
    })
    .from(analyticsEvents)
    .leftJoin(developers, eq(developers.id, analyticsEvents.developerId))
    .where(eq(analyticsEvents.userId, userId))
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(limit);

  return rows.map((row) => ({
    eventName: row.eventName,
    occurredAt: row.occurredAt,
    detail: describeActivity(row.eventName, row.payload as Record<string, unknown>, row.developerName),
  }));
}

/**
 * One grouped query for a whole page of users — never N+1. Used by the
 * admin Users list to show a real "last active" / activity band per user,
 * the same recency-based idea as getUserActivityTimeline's data, just
 * batched.
 */
export async function getLastActivityByUserIds(
  userIds: string[],
): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      userId: analyticsEvents.userId,
      lastActive: sql<Date>`max(${analyticsEvents.occurredAt})`,
    })
    .from(analyticsEvents)
    .where(inArray(analyticsEvents.userId, userIds))
    .groupBy(analyticsEvents.userId);

  const map = new Map<string, Date>();
  for (const row of rows) {
    if (row.userId) map.set(row.userId, new Date(row.lastActive));
  }
  return map;
}

export function activityBandFor(lastActive: Date | undefined, now: Date = new Date()): ActivityBand {
  if (!lastActive) return "NEVER";
  const days = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return "DAILY";
  if (days <= 7) return "WEEKLY";
  if (days <= 30) return "MONTHLY";
  return "INACTIVE";
}

function describeActivity(
  eventName: string,
  payload: Record<string, unknown>,
  developerName: string | null,
): string | null {
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
      return developerName
        ? `Visited ${developerName}'s official website`
        : typeof payload.targetDomain === "string"
          ? `Visited ${payload.targetDomain}`
          : null;
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

/**
 * Infrastructure/capacity support queries for Platform Health. These are
 * deliberately separate from the product-analytics functions above: they
 * exist to answer "how big is this database and what's using the space",
 * not "how is the product being used".
 */

/**
 * Every ACTIVE developer's effective verification status, counted in one
 * query. Uses the exact same precedence logic as
 * effectiveVerificationStatusSql() (VERIFIED > NEEDS_REVERIFICATION >
 * PENDING_VERIFICATION > DISCOVERED > REJECTED > INACTIVE; no candidate
 * at all reads as DISCOVERED) — written out explicitly with table
 * aliases here, rather than re-embedding that function's Drizzle-object
 * output, to avoid a real bug this project already hit once: Drizzle
 * silently drops table-qualification on a correlated-subquery column
 * reference when the same raw `sql` fragment is reused as a SELECT
 * projection value elsewhere. Hand-written, fully-qualified SQL sidesteps
 * that class of bug entirely. If the precedence order ever changes, it
 * must be changed in both places.
 */
export async function getDeveloperVerificationBreakdown(): Promise<DeveloperVerificationBreakdown> {
  const db = getDb();
  const result = await db.execute<{ effective_status: string; n: string }>(sql`
    select sub.effective_status, count(*) as n
    from (
      select coalesce((
        select ws.verification_status
        from ${websiteCandidates} ws
        where ws.developer_id = d.id
        order by case ws.verification_status
          when 'VERIFIED' then 1
          when 'NEEDS_REVERIFICATION' then 2
          when 'PENDING_VERIFICATION' then 3
          when 'DISCOVERED' then 4
          when 'REJECTED' then 5
          when 'INACTIVE' then 6
        end
        limit 1
      ), 'DISCOVERED') as effective_status
      from ${developers} d
      where d.status = 'ACTIVE'
    ) sub
    group by sub.effective_status
  `);

  const counts: DeveloperVerificationBreakdown = {
    discovered: 0,
    pendingVerification: 0,
    verified: 0,
    needsReverification: 0,
    rejected: 0,
    inactive: 0,
  };
  const keyByStatus: Record<string, keyof DeveloperVerificationBreakdown> = {
    DISCOVERED: "discovered",
    PENDING_VERIFICATION: "pendingVerification",
    VERIFIED: "verified",
    NEEDS_REVERIFICATION: "needsReverification",
    REJECTED: "rejected",
    INACTIVE: "inactive",
  };
  for (const row of result.rows) {
    const key = keyByStatus[row.effective_status];
    if (key) counts[key] = Number(row.n);
  }
  return counts;
}

/**
 * Exact row counts for every application table Platform Health needs
 * besides `developers` (already covered by getExecutiveOverview). Six
 * independent, cheap count() queries run in parallel — not N+1 (a fixed,
 * small set of aggregate queries, not one per row), and cheap at this
 * project's current and near-term scale.
 */
export async function getInfrastructureEntityCounts(): Promise<InfrastructureEntityCounts> {
  const db = getDb();
  const [
    [developersRow],
    [websiteCandidatesRow],
    [evidenceRow],
    [verificationEventsRow],
    [profilesRow],
    [notificationsRow],
    [analyticsEventsRow],
    [developerEditEventsRow],
  ] = await Promise.all([
    db.select({ n: count() }).from(developers),
    db.select({ n: count() }).from(websiteCandidates),
    db.select({ n: count() }).from(evidence),
    db.select({ n: count() }).from(verificationEvents),
    db.select({ n: count() }).from(profiles),
    db.select({ n: count() }).from(notifications),
    db.select({ n: count() }).from(analyticsEvents),
    db.select({ n: count() }).from(developerEditEvents),
  ]);

  return {
    developers: developersRow?.n ?? 0,
    websiteCandidates: websiteCandidatesRow?.n ?? 0,
    evidence: evidenceRow?.n ?? 0,
    verificationEvents: verificationEventsRow?.n ?? 0,
    profiles: profilesRow?.n ?? 0,
    notifications: notificationsRow?.n ?? 0,
    analyticsEvents: analyticsEventsRow?.n ?? 0,
    developerEditEvents: developerEditEventsRow?.n ?? 0,
  };
}

/**
 * Real, exact size (table + its own indexes + TOAST) for every
 * application table, in one query — pg_total_relation_size() reads
 * on-disk metadata Postgres already tracks; it never scans table
 * contents, so this stays cheap regardless of table size. The `in (...)`
 * list is written as individual bound parameters (never a JS array
 * interpolated into `= any(...)`) — this project already hit one real
 * Drizzle raw-sql edge case (see effectiveVerificationStatusSql's doc
 * comment), so array-parameter serialization here is deliberately not
 * trusted without the same kind of direct verification.
 */
export async function getDatabaseTableSizes(): Promise<TableSizeInfo[]> {
  const db = getDb();
  const result = await db.execute<{ relname: string; size_bytes: string }>(sql`
    select relname, pg_total_relation_size(relid) as size_bytes
    from pg_stat_user_tables
    where schemaname = 'public'
      and relname in (
        ${"developers"}, ${"website_candidates"}, ${"evidence"},
        ${"verification_events"}, ${"profiles"}, ${"notifications"}, ${"analytics_events"},
        ${"developer_edit_events"}
      )
  `);

  return result.rows.map((row) => ({
    tableName: row.relname,
    sizeBytes: Number(row.size_bytes),
  }));
}
