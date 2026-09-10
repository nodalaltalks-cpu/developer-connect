import { and, count, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "../developer-connect/db/client.ts";
import { createPostgresRepositories } from "../developer-connect/db/postgres-repository.ts";
import {
  developers,
  websiteCandidates,
  verificationEvents,
  analyticsEvents,
  profiles,
  evidence,
} from "../developer-connect/db/schema.ts";
import { PROFILE_FIELD_CONFIG } from "../profile/field-config.ts";
import { calculateProfileCompletion } from "../profile/completion.ts";
import { computeRate } from "./rate.ts";
import { comparePeriods } from "./period-comparison.ts";
import type {
  ExecutiveOverview,
  SearchIntelligence,
  DeveloperStat,
  VerificationOperations,
  DataQuality,
  AuditLogEntry,
  AiReadiness,
  UserAndProfileIntelligence,
  VerificationOpportunity,
  ConversionStep,
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
  const [pendingVerification] = await db
    .select({ n: count() })
    .from(websiteCandidates)
    .where(eq(websiteCandidates.verificationStatus, "PENDING_VERIFICATION"));
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

  return {
    totalSearches,
    uniqueQueries: Number(uniqueRow?.n ?? 0),
    topQueries,
    highDemandUnverified,
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

/**
 * Definition: per-developer attention and conversion, for ACTIVE
 * developers only.
 * Source: developers (identity), website_candidates (verification
 * status), analytics_events (search_result_clicked, developer_page_viewed,
 * official_website_clicked).
 * Window: all-time.
 * Limitation: `searchResultClicks` is the real available proxy for search
 * demand per developer — raw search volume isn't attributed to a specific
 * developer (only which result someone clicked is), so this is never
 * labeled "search volume." One query per developer — fine at current
 * scale (single digits to low hundreds); would need batching in the
 * thousands.
 */
export async function getDeveloperIntelligence(limit = 50): Promise<DeveloperStat[]> {
  const db = getDb();
  const rows = await db
    .select({
      developerId: developers.id,
      displayName: developers.displayName,
      slug: developers.slug,
    })
    .from(developers)
    .where(eq(developers.status, "ACTIVE"))
    .limit(limit);

  const stats: DeveloperStat[] = [];
  for (const row of rows) {
    const [verified] = await db
      .select({ status: websiteCandidates.verificationStatus })
      .from(websiteCandidates)
      .where(
        and(
          eq(websiteCandidates.developerId, row.developerId),
          eq(websiteCandidates.verificationStatus, "VERIFIED"),
        ),
      );

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
      verificationStatus: verified?.status ?? null,
      searchResultClicks,
      pageViews,
      officialWebsiteClicks: clicks,
      ctr: computeRate(clicks, pageViews),
    });
  }

  return stats.sort((a, b) => b.pageViews - a.pageViews);
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

  const allProfiles = await db.select({ data: profiles.data }).from(profiles);
  const percentages = allProfiles
    .map((row) => calculateProfileCompletion(row.data as Record<string, unknown>).percentage)
    .filter((value): value is number => value !== null);
  const averageCompletionPercent =
    percentages.length > 0
      ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 10) / 10
      : null;

  return {
    distinctSessions,
    distinctAuthenticatedUsers,
    sessionsPerUser:
      distinctAuthenticatedUsers > 0
        ? Math.round((distinctSessions / distinctAuthenticatedUsers) * 10) / 10
        : null,
    profilesStarted: profilesRow?.n ?? 0,
    profileFieldsConfigured: PROFILE_FIELD_CONFIG.length,
    averageCompletionPercent,
  };
}
