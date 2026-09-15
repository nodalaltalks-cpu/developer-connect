import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Smoke tests for the founder-dashboard metrics layer: every query must
 * run without error against a real (here, near-empty) database and
 * return well-formed, non-fabricated results — zeros and nulls, not
 * placeholder numbers. Skipped unless TEST_DATABASE_URL is set.
 */
test(
  "admin-analytics: every metrics query runs cleanly and returns honest zero/null values on a fresh database",
  { skip: !hasTestDatabase },
  async () => {
    const {
      getExecutiveOverview,
      getSearchIntelligence,
      getHighPriorityVerificationOpportunities,
      getDeveloperIntelligence,
      getVerificationOperations,
      getDataQuality,
      getAuditLog,
      getAiReadiness,
      getUserAndProfileIntelligence,
    } = await import("../queries.ts");

    const overview = await getExecutiveOverview();
    assert.ok(overview.developersTracked >= 0);
    assert.ok(Array.isArray(overview.funnel) && overview.funnel.length === 4);
    assert.equal(overview.funnel[0].conversionFromPrevious, null);
    // Rates are always {numerator, denominator, percent} — never a bare number.
    assert.ok("numerator" in overview.mobileShare && "denominator" in overview.mobileShare);
    assert.ok("numerator" in overview.northStarConversion);
    // Comparisons always carry both period values and an explicit sufficient-data flag.
    assert.ok("sufficientData" in overview.searchVolumeComparison);
    assert.ok("sufficientData" in overview.officialWebsiteClicksComparison);

    const search = await getSearchIntelligence();
    assert.ok(Array.isArray(search.topQueries));
    assert.ok(Array.isArray(search.highDemandUnverified));
    assert.ok(Array.isArray(search.geographyDemand.byCountry));
    assert.ok(Array.isArray(search.geographyDemand.byState));
    assert.ok(Array.isArray(search.geographyDemand.byCity));
    assert.ok(Array.isArray(search.topEngagedDevelopers));
    assert.ok(search.authenticationSplit.anonymousSearches >= 0);
    assert.ok(search.authenticationSplit.authenticatedSearches >= 0);

    const opportunities = await getHighPriorityVerificationOpportunities();
    assert.ok(Array.isArray(opportunities));
    for (const opportunity of opportunities) {
      assert.ok(["NOT_INDEXED", "INDEXED_UNVERIFIED", "INDEXED_VERIFIED"].includes(opportunity.status));
    }

    const developerPage = await getDeveloperIntelligence();
    assert.ok(Array.isArray(developerPage.developers));
    assert.ok(developerPage.totalCount >= 0);
    assert.equal(developerPage.page, 1);
    assert.ok(developerPage.pageSize > 0);
    for (const developer of developerPage.developers) {
      assert.ok("numerator" in developer.ctr && "denominator" in developer.ctr);
      assert.ok(typeof developer.searchResultClicks === "number");
    }

    const ops = await getVerificationOperations();
    assert.ok(ops.discovered >= 0);

    const quality = await getDataQuality();
    assert.ok(quality.developersWithoutVerifiedWebsite >= 0);

    const auditLog = await getAuditLog();
    assert.ok(Array.isArray(auditLog));

    const { PROFILE_FIELD_CONFIG } = await import("../../profile/field-config.ts");

    const readiness = await getAiReadiness();
    assert.equal(readiness.profileFieldsConfigured, PROFILE_FIELD_CONFIG.length);

    const userIntel = await getUserAndProfileIntelligence();
    assert.equal(userIntel.profileFieldsConfigured, PROFILE_FIELD_CONFIG.length);
    assert.ok(Array.isArray(userIntel.completionDistribution));
    assert.ok(Array.isArray(userIntel.sectionCompletion));
  },
);

/**
 * Regression coverage for the "Pending verification: 0" bug: the Overview
 * tile previously matched only the exact PENDING_VERIFICATION status,
 * silently excluding DISCOVERED candidates — most of the real
 * /admin/verification queue.
 *
 * This shared test database is NOT exclusive to a single test run (other
 * suites, and possibly other concurrent runs, write "TEST —" rows to it
 * and never clean up — see postgres-repository.integration.test.ts), so a
 * global before/after delta on getExecutiveOverview() is racy: observed in
 * practice, an isolated run of this exact test saw the global
 * pendingVerification count move by more than the 1 candidate this test
 * itself created, from concurrent activity elsewhere on the same
 * database. The deterministic part of this test therefore queries
 * website_candidates scoped to ONE freshly created, uniquely-named test
 * developer — unaffected by anything else happening on the shared
 * database — and proves the exact fix directly: PENDING_REVIEW_STATUSES
 * (the shared constant getExecutiveOverview's query now reads from) must
 * count a DISCOVERED candidate, and must NOT count a NEEDS_REVERIFICATION
 * one (which has its own separate Overview tile).
 */
test(
  "admin-analytics: 'Pending verification' counts DISCOVERED candidates (not just PENDING_VERIFICATION), and never counts NEEDS_REVERIFICATION",
  { skip: !hasTestDatabase },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { websiteCandidates } = await import("../../developer-connect/db/schema.ts");
    const { and, eq, inArray, count } = await import("drizzle-orm");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { PENDING_REVIEW_STATUSES } = await import("../../developer-connect/verification-queue-state.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { markNeedsReverification, approveAndPublishCandidate } = await import(
      "../../developer-connect/verification-service.ts"
    );

    const repos = createPostgresRepositories();
    const db = getDb();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

    const developer = await repos.developers.create({
      legalName: `TEST — Pending Verification Audit Co ${randomUUID()}`,
      displayName: `TEST — Pending Verification Audit Co ${randomUUID()}`,
      slug: `test-pending-verification-audit-${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    async function pendingReviewCountFor(developerId: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(websiteCandidates)
        .where(
          and(
            eq(websiteCandidates.developerId, developerId),
            inArray(websiteCandidates.verificationStatus, [...PENDING_REVIEW_STATUSES]),
          ),
        );
      return row?.n ?? 0;
    }

    assert.equal(await pendingReviewCountFor(developer.id), 0);

    // A brand-new candidate starts at DISCOVERED and stays there until a
    // founder acts — exactly the state most of the real queue sits in.
    // This is the exact case that previously read as 0.
    const discoveredOnly = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://discovered-${randomUUID()}.example`,
      discoverySource: "AGENT_CRAWL",
      actor: { actorType: "AGENT", actorId: "agent-1" },
    });
    assert.equal(discoveredOnly.verificationStatus, "DISCOVERED");
    assert.equal(
      await pendingReviewCountFor(developer.id),
      1,
      "a DISCOVERED candidate must be counted by PENDING_REVIEW_STATUSES — this is the exact bug fix",
    );

    // A second candidate that gets approved (VERIFIED) and then flagged
    // for re-verification — must land in needsReverification, NOT
    // pendingVerification (they're deliberately separate tiles).
    const forReverification = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://reverify-${randomUUID()}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, forReverification.id, founder, "Confirmed official site");
    await markNeedsReverification(repos, forReverification.id, founder, "Site redesigned, re-checking");

    assert.equal(
      await pendingReviewCountFor(developer.id),
      1,
      "NEEDS_REVERIFICATION must stay excluded from pendingVerification — it has its own separate tile",
    );

    // Best-effort confirmation that getExecutiveOverview() is wired to the
    // same fix end-to-end — directional only (>=), since this shared
    // database may have concurrent writers outside this test's control.
    const { getExecutiveOverview } = await import("../queries.ts");
    const overview = await getExecutiveOverview();
    assert.ok(overview.pendingVerification >= 1, "the Overview's pendingVerification must be non-zero once a DISCOVERED candidate exists");
  },
);

/**
 * Regression coverage for the Search Intelligence strengthening (geo
 * demand, developer engagement, anonymous/authenticated split). Writes
 * directly through postgresAnalyticsSink (the same sink public-actions.ts
 * uses) rather than through the "use server" actions themselves, which
 * require a live Next.js request context (cookies/auth) this plain
 * node:test environment doesn't provide.
 *
 * Asserts against the real underlying table with a uniquely-tagged value
 * (not the ranked/limited top-10 aggregate, which — like the
 * Pending-verification test above — is inherently racy on this shared
 * database across concurrent test runs) so this test is deterministic
 * regardless of what else has ever been recorded.
 */
test(
  "admin-analytics: search geography, developer engagement, and auth-split are real, queryable data — not fabricated",
  { skip: !hasTestDatabase },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { analyticsEvents } = await import("../../developer-connect/db/schema.ts");
    const { and, eq, sql: sqlTag } = await import("drizzle-orm");
    const { postgresAnalyticsSink } = await import("../../developer-connect/db/postgres-analytics-sink.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveAndPublishCandidate } = await import("../../developer-connect/verification-service.ts");

    const db = getDb();
    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };
    const marker = randomUUID();
    const uniqueCountry = `TEST-COUNTRY-${marker}`;
    const uniqueUserId = `test-user-${marker}`;

    // 1. A geo-tagged search — proves country/state/city land in the
    // real JSONB payload and are extractable via ->>'country'.
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: new Date(),
      sessionId: `test-session-${marker}`,
      query: "geo demand test",
      resultCount: 1,
      country: uniqueCountry,
    });
    const [geoRow] = await db
      .select({ n: sqlTag<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        sqlTag`${analyticsEvents.eventName} = 'search_performed' and ${analyticsEvents.payload}->>'country' = ${uniqueCountry}`,
      );
    assert.equal(Number(geoRow?.n ?? 0), 1, "the geo-tagged search event must be stored with its real country value");

    // 2. A real developer engagement event — proves developerId + eventName grouping is real.
    const developer = await createDeveloper(repos.developers, {
      legalName: `TEST — Engagement Co ${marker}`,
      displayName: `TEST — Engagement Co ${marker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://engagement-${marker}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, candidate.id, founder, "Confirmed official site");
    await postgresAnalyticsSink.record({
      eventName: "official_website_clicked",
      occurredAt: new Date(),
      sessionId: `test-session-${marker}`,
      developerId: developer.id,
      targetDomain: `engagement-${marker}.example`,
    });
    const [clickRow] = await db
      .select({ n: sqlTag<number>`count(*)` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.eventName, "official_website_clicked"), eq(analyticsEvents.developerId, developer.id)));
    assert.equal(Number(clickRow?.n ?? 0), 1, "the real developer's official-website click must be recorded against its real id");

    // 3. An authenticated search — proves userId is captured (not always null).
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: new Date(),
      sessionId: `test-session-${marker}`,
      userId: uniqueUserId,
      query: "auth split test",
      resultCount: 1,
    });
    const [authRow] = await db
      .select({ n: sqlTag<number>`count(*)` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.eventName, "search_performed"), eq(analyticsEvents.userId, uniqueUserId)));
    assert.equal(Number(authRow?.n ?? 0), 1, "an authenticated search must be recorded with its real userId, not silently dropped");
  },
);
