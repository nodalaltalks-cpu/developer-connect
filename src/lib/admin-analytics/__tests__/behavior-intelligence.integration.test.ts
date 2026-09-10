import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database test of getUserBehaviorIntelligence() / getRetentionMetrics()
 * / getSearchIntelligence().searchBehavior — these are grouped, session-level
 * SQL queries that read the ENTIRE analytics_events table, so (unlike most
 * other tests in this project) they can't be verified with a uniquely-
 * marked subset of rows — accumulated noise from other test runs against
 * this same shared, never-truncated test database would make any exact
 * assertion meaningless or flaky. This test clears analytics_events first
 * (safe: this is the disposable test database, guarded by test-db-guard.ts,
 * never the primary one) to get a known-clean slate, then asserts exact
 * counts against controlled synthetic events.
 *
 * Relies on test FILES running sequentially, not concurrently (see
 * `--test-concurrency=1` on the `test` npm script) — this is one of two
 * tests in the suite that clear the whole table (the other is
 * verification-opportunities.integration.test.ts); running them in
 * parallel let one file's DELETE race the other's inserts and produced
 * real, intermittent assertion failures until that flag was added.
 */
test(
  "behavior intelligence: session segments, search behavior, and retention are computed correctly against a known event set",
  { skip: !hasTestDatabase },
  async () => {
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { analyticsEvents } = await import("../../developer-connect/db/schema.ts");
    const { postgresAnalyticsSink } = await import("../../developer-connect/db/postgres-analytics-sink.ts");
    const { getUserBehaviorIntelligence, getRetentionMetrics, getSearchIntelligence } = await import(
      "../queries.ts"
    );

    await getDb().delete(analyticsEvents);

    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

    // --- Session A: ZERO_RESULT_ONLY, NEW (single day), refined search (2 distinct zero-result queries) ---
    const sessionA = randomUUID();
    await postgresAnalyticsSink.record({
      eventName: "zero_result_search",
      occurredAt: now,
      sessionId: sessionA,
      deviceType: "desktop",
      query: "alpha tower",
    });
    await postgresAnalyticsSink.record({
      eventName: "zero_result_search",
      occurredAt: now,
      sessionId: sessionA,
      deviceType: "desktop",
      query: "beta heights",
    });

    // --- Session B: repeated search (same query twice), successful search, HIGH_INTENT (click), RETURNING (2 distinct days) ---
    const sessionB = randomUUID();
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: daysAgo(10),
      sessionId: sessionB,
      deviceType: "mobile",
      query: "gamma developers",
      resultCount: 1,
    });
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: daysAgo(10),
      sessionId: sessionB,
      deviceType: "mobile",
      query: "gamma developers",
      resultCount: 1,
    });
    await postgresAnalyticsSink.record({
      eventName: "official_website_clicked",
      occurredAt: daysAgo(9), // more than 1hr after first_seen, within 30 days — a genuine return
      sessionId: sessionB,
      deviceType: "mobile",
      developerId: randomUUID(),
      targetDomain: "example.com",
    });

    // --- Session C: RESEARCHING (page view, no click), no search at all ---
    const sessionC = randomUUID();
    await postgresAnalyticsSink.record({
      eventName: "developer_page_viewed",
      occurredAt: now,
      sessionId: sessionC,
      deviceType: "desktop",
      developerId: randomUUID(),
    });

    // --- Session D: old enough (35 days) to be D30-eligible, and did NOT return ---
    const sessionD = randomUUID();
    await postgresAnalyticsSink.record({
      eventName: "developer_page_viewed",
      occurredAt: daysAgo(35),
      sessionId: sessionD,
      deviceType: "desktop",
      developerId: randomUUID(),
    });

    const behavior = await getUserBehaviorIntelligence();
    const bySegment = Object.fromEntries(behavior.segments.map((s) => [s.segment, s.count]));

    assert.equal(behavior.distinctSessions, 4);
    assert.equal(bySegment.ZERO_RESULT_ONLY, 1); // session A only
    assert.equal(bySegment.HIGH_INTENT, 1); // session B only
    assert.equal(bySegment.RESEARCHING, 2); // sessions C and D (page view, no click)
    assert.equal(bySegment.RETURNING, 1); // session B (2 distinct days)
    assert.equal(bySegment.NEW, 3); // sessions A, C, D (single day each)

    const search = await getSearchIntelligence();
    assert.equal(search.searchBehavior.searchingSessions, 2); // sessions A and B searched
    assert.equal(search.searchBehavior.refinedSearchSessions, 1); // session A: 2 distinct queries
    assert.equal(search.searchBehavior.repeatedSearchSessions, 1); // session B: same query twice

    const retention = await getRetentionMetrics();
    const d1 = retention.windows.find((w) => w.windowDays === 1)!;
    const d7 = retention.windows.find((w) => w.windowDays === 7)!;
    const d30 = retention.windows.find((w) => w.windowDays === 30)!;

    // Sessions B (10 days old) and D (35 days old) are both eligible for D1/D7;
    // only D is old enough (>=30 days) to be D30-eligible. B returned
    // (the click at day 9); D never came back.
    assert.equal(d1.eligibleSessions, 2);
    assert.equal(d1.rate.numerator, 1);
    assert.equal(d7.eligibleSessions, 2);
    assert.equal(d7.rate.numerator, 1);
    assert.equal(d30.eligibleSessions, 1);
    assert.equal(d30.rate.numerator, 0);

    // The click-vs-no-click comparison's own eligibility gate is fixed at
    // 7 days: B (clicked) and D (didn't) both qualify, one on each side —
    // intentionally below MIN_SAMPLE_FOR_COMPARISON, so this must report
    // insufficient data rather than a misleading 100%-vs-0% comparison.
    assert.equal(retention.returnByOfficialWebsiteClick.sufficientData, false);
  },
);
