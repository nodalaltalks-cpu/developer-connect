import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database test of the three-way categorization
 * getHighPriorityVerificationOpportunities() must produce — this is the
 * one piece of new logic in this round that most needs a real end-to-end
 * check, since it joins search events against the live directory.
 * Skipped unless TEST_DATABASE_URL is set.
 */
test(
  "getHighPriorityVerificationOpportunities: correctly distinguishes NOT_INDEXED, INDEXED_UNVERIFIED, and INDEXED_VERIFIED",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveCandidate, markReadyForReview } = await import("../../developer-connect/verification-service.ts");
    const { postgresAnalyticsSink } = await import("../../developer-connect/db/postgres-analytics-sink.ts");
    const { getHighPriorityVerificationOpportunities } = await import("../queries.ts");
    const { getDb } = await import("../../developer-connect/db/client.ts");
    const { analyticsEvents } = await import("../../developer-connect/db/schema.ts");

    // getHighPriorityVerificationOpportunities() reads only the top 10
    // all-time zero-result queries by count. This test's own queries
    // (below) are recorded 15 times each specifically to rank in that
    // top 10 — but this integration suite has now run against this same
    // disposable, never-truncated test database many times over, and
    // every prior run left its own count=15 queries behind, so the top-10
    // window is no longer reliably dominated by just this run's data. The
    // test database is disposable and safe to clear; the primary database
    // is untouched by this (test-db-guard.ts refuses to run at all if
    // TEST_DATABASE_URL ever resolved to the same database as DATABASE_URL).
    await getDb().delete(analyticsEvents);

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };
    const marker = randomUUID().slice(0, 8);

    // An indexed developer with no verified website yet.
    const unverifiedDeveloper = await createDeveloper(repos.developers, {
      legalName: `TEST — Opportunity Unverified ${marker}`,
      displayName: `TEST Opportunity Unverified ${marker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    await submitWebsiteCandidate(repos, {
      developerId: unverifiedDeveloper.id,
      url: `https://unverified-opportunity-${marker}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    // A fully verified developer — a zero-result search matching its name
    // would be a name-matching gap, not a verification gap.
    const verifiedDeveloper = await createDeveloper(repos.developers, {
      legalName: `TEST — Opportunity Verified ${marker}`,
      displayName: `TEST Opportunity Verified ${marker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const verifiedCandidate = await submitWebsiteCandidate(repos, {
      developerId: verifiedDeveloper.id,
      url: `https://verified-opportunity-${marker}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, verifiedCandidate.id, founder);
    await approveCandidate(repos, verifiedCandidate.id, founder, "Confirmed");

    // Simulate the zero-result searches these three scenarios would produce.
    // getSearchIntelligence() (which this reads from) only returns the top
    // 10 zero-result queries by count — repeated test runs against the
    // same shared test database accumulate other count=1 queries, so each
    // of these is recorded enough times to reliably rank in the top 10
    // regardless of that accumulation, rather than relying on being the
    // only recent entry.
    const notIndexedQuery = `zzz-nonexistent-developer-${marker}`;
    const REPEAT_COUNT = 15;
    for (const query of [
      `TEST Opportunity Unverified ${marker}`,
      `TEST Opportunity Verified ${marker}`,
      notIndexedQuery,
    ]) {
      for (let i = 0; i < REPEAT_COUNT; i++) {
        await postgresAnalyticsSink.record({
          eventName: "zero_result_search",
          occurredAt: new Date(),
          sessionId: `test-session-${randomUUID()}`,
          query,
        });
      }
    }

    const opportunities = await getHighPriorityVerificationOpportunities();
    const byQuery = new Map(opportunities.map((o) => [o.query.toLowerCase(), o]));

    const unverifiedResult = byQuery.get(`test opportunity unverified ${marker}`);
    const verifiedResult = byQuery.get(`test opportunity verified ${marker}`);
    const notIndexedResult = byQuery.get(notIndexedQuery.toLowerCase());

    assert.equal(unverifiedResult?.status, "INDEXED_UNVERIFIED");
    assert.equal(unverifiedResult?.developer?.id, unverifiedDeveloper.id);

    assert.equal(verifiedResult?.status, "INDEXED_VERIFIED");
    assert.equal(verifiedResult?.developer?.id, verifiedDeveloper.id);

    assert.equal(notIndexedResult?.status, "NOT_INDEXED");
    assert.equal(notIndexedResult?.developer, null);
  },
);
