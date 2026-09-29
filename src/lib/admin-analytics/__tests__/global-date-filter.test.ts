import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";
import { resolveDateRange } from "../date-range.ts";

/**
 * Founder Dashboard global date filter — proves the query layer's actual
 * DATE-FILTERED functions genuinely change with the selected range,
 * against the real database (skipped unless TEST_DATABASE_URL is set,
 * same convention as every other integration test in this suite).
 * SNAPSHOT/LIFETIME functions are proven UNCHANGED by range in the same
 * tests, so a regression that accidentally starts filtering one of them
 * would be caught here too.
 */
test(
  "global date filter: getExecutiveOverview's search counts respect `range`; developer/verification snapshots never do",
  { skip: !hasTestDatabase },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { postgresAnalyticsSink } = await import("../../developer-connect/db/postgres-analytics-sink.ts");
    const { getExecutiveOverview } = await import("../queries.ts");

    const marker = randomUUID();
    await postgresAnalyticsSink.record({
      eventName: "search_performed",
      occurredAt: new Date(),
      sessionId: `test-session-${marker}`,
      query: `global filter test ${marker}`,
      resultCount: 1,
    });

    const wideRange = resolveDateRange("year");
    const farPastRange = { ...resolveDateRange("day"), start: new Date("2000-01-01"), end: new Date("2000-01-02") };

    const withEvent = await getExecutiveOverview(wideRange);
    const withoutEvent = await getExecutiveOverview(farPastRange);

    assert.ok(
      withEvent.totalSearches > withoutEvent.totalSearches,
      "a real search event inside the range must be counted; the exact same query with a range that excludes it must not count it",
    );

    // Snapshot fields must read the SAME real, current, live state regardless of which range was passed — proves they never filter by range at all.
    assert.equal(withEvent.developersTracked, withoutEvent.developersTracked);
    assert.equal(withEvent.verifiedDevelopers, withoutEvent.verifiedDevelopers);
    assert.equal(withEvent.pendingVerification, withoutEvent.pendingVerification);
    assert.equal(withEvent.needsReverification, withoutEvent.needsReverification);
  },
);

test(
  "global date filter: getVerificationActivity counts real verification_events transitions inside the range, never a candidate's current status",
  { skip: !hasTestDatabase },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveAndPublishCandidate } = await import("../../developer-connect/verification-service.ts");
    const { getVerificationActivity } = await import("../queries.ts");

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };
    const marker = randomUUID();

    const developer = await repos.developers.create({
      legalName: `TEST — Verification Activity Co ${marker}`,
      displayName: `TEST — Verification Activity Co ${marker}`,
      slug: `test-verification-activity-${marker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://verification-activity-${marker}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, candidate.id, founder, "Confirmed official site");

    const wideRange = resolveDateRange("year");
    const farPastRange = { ...wideRange, start: new Date("2000-01-01"), end: new Date("2000-01-02") };

    const activityNow = await getVerificationActivity(wideRange);
    const activityPast = await getVerificationActivity(farPastRange);

    assert.ok(activityNow.VERIFIED >= 1, "the real VERIFIED transition just recorded must be counted within a range that covers it");
    assert.ok(
      activityPast.VERIFIED >= 0 && activityPast.VERIFIED < activityNow.VERIFIED,
      "a range that excludes the real event's timestamp must not count it",
    );
  },
);

test(
  "global date filter: getAuditLog respects `range` on verification_events.created_at",
  { skip: !hasTestDatabase },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { markReadyForReview } = await import("../../developer-connect/verification-service.ts");
    const { getAuditLog } = await import("../queries.ts");

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };
    const marker = randomUUID();

    const developer = await repos.developers.create({
      legalName: `TEST — Audit Log Range Co ${marker}`,
      displayName: `TEST — Audit Log Range Co ${marker}`,
      slug: `test-audit-log-range-${marker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://audit-log-range-${marker}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, candidate.id, founder);

    const wideRange = resolveDateRange("year");
    const farPastRange = { ...wideRange, start: new Date("2000-01-01"), end: new Date("2000-01-02") };

    const entriesInRange = await getAuditLog(500, wideRange);
    const entriesOutOfRange = await getAuditLog(500, farPastRange);

    assert.ok(
      entriesInRange.some((e) => e.candidateId === candidate.id),
      "the real event just recorded must appear when the range covers it",
    );
    assert.ok(
      !entriesOutOfRange.some((e) => e.candidateId === candidate.id),
      "the same event must NOT appear when the range excludes its real timestamp",
    );
  },
);
