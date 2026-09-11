import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database tests for getDeveloperIntelligence()'s status filter — the
 * fix for /admin/developers only ever being able to tell VERIFIED from
 * null, even though the real verification lifecycle
 * (website_candidates.verification_status) has always had six states.
 *
 * Every test scopes its assertions through a `search` term unique to that
 * test run, exactly like developer-intelligence-pagination.test.ts, since
 * the shared test database already has many developers in it from other
 * suites and prior manual runs.
 */

const founder = { actorType: "FOUNDER" as const, actorId: "status-filter-test-founder" };
const system = { actorType: "SYSTEM" as const, actorId: "status-filter-test-system" };

async function makeDeveloper(
  createDeveloper: typeof import("../../developer-connect/developer-service.ts").createDeveloper,
  repos: ReturnType<typeof import("../../developer-connect/db/postgres-repository.ts").createPostgresRepositories>,
  token: string,
  label: string,
) {
  return createDeveloper(repos.developers, {
    legalName: `${label} ${token} Private Limited`,
    displayName: `${label} ${token}`,
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
}

test(
  "getDeveloperIntelligence: status filter reflects the real candidate lifecycle — DISCOVERED, PENDING_VERIFICATION, VERIFIED, NEEDS_REVERIFICATION, REJECTED, INACTIVE each return exactly the right developers",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const {
      markReadyForReview,
      approveAndPublishCandidate,
      markNeedsReverification,
      rejectCandidate,
      deactivateCandidate,
    } = await import("../../developer-connect/verification-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    // DISCOVERED: a candidate that has never moved past intake.
    const discoveredDev = await makeDeveloper(createDeveloper, repos, token, "Discovered Co");
    await submitWebsiteCandidate(repos, {
      developerId: discoveredDev.id,
      url: `https://www.discovered-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    // PENDING_VERIFICATION: queued for founder review, not yet decided.
    const pendingDev = await makeDeveloper(createDeveloper, repos, token, "Pending Co");
    const pendingCandidate = await submitWebsiteCandidate(repos, {
      developerId: pendingDev.id,
      url: `https://www.pending-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, pendingCandidate.id, founder);

    // VERIFIED: approved and published.
    const verifiedDev = await makeDeveloper(createDeveloper, repos, token, "Verified Co");
    const verifiedCandidate = await submitWebsiteCandidate(repos, {
      developerId: verifiedDev.id,
      url: `https://www.verified-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, verifiedCandidate.id, founder, "Looks correct");

    // NEEDS_REVERIFICATION: was verified, now flagged (e.g. by an automated health check).
    const reverifyDev = await makeDeveloper(createDeveloper, repos, token, "Reverify Co");
    const reverifyCandidate = await submitWebsiteCandidate(repos, {
      developerId: reverifyDev.id,
      url: `https://www.reverify-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, reverifyCandidate.id, founder, "Looks correct");
    await markNeedsReverification(repos, reverifyCandidate.id, system, "Site returned an error during a routine health check");

    // REJECTED: decided against, and nothing newer for this developer.
    const rejectedDev = await makeDeveloper(createDeveloper, repos, token, "Rejected Co");
    const rejectedCandidate = await submitWebsiteCandidate(repos, {
      developerId: rejectedDev.id,
      url: `https://www.rejected-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await rejectCandidate(repos, rejectedCandidate.id, founder, "Not the developer's official site");

    // INACTIVE: deactivated, and nothing newer for this developer.
    const inactiveDev = await makeDeveloper(createDeveloper, repos, token, "Inactive Co");
    const inactiveCandidate = await submitWebsiteCandidate(repos, {
      developerId: inactiveDev.id,
      url: `https://www.inactive-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await deactivateCandidate(repos, inactiveCandidate.id, founder, "Developer requested removal");

    const cases: [string, string][] = [
      ["DISCOVERED", discoveredDev.id],
      ["PENDING_VERIFICATION", pendingDev.id],
      ["VERIFIED", verifiedDev.id],
      ["NEEDS_REVERIFICATION", reverifyDev.id],
      ["REJECTED", rejectedDev.id],
      ["INACTIVE", inactiveDev.id],
    ];

    for (const [status, expectedDeveloperId] of cases) {
      const page = await getDeveloperIntelligence({ search: token, status, pageSize: 10, page: 1 });
      assert.deepEqual(
        page.developers.map((d) => d.developerId).sort(),
        [expectedDeveloperId].sort(),
        `status=${status} should return exactly the ${status} developer`,
      );
      assert.equal(page.totalCount, 1, `totalCount for status=${status} should reflect exactly one match`);
      // Not just "the filter includes the right row" — the row's own
      // displayed verificationStatus must also read correctly. This is a
      // genuinely separate code path (the SELECT projection) from the
      // WHERE-clause filter above, and a real regression here (Drizzle
      // silently dropping table qualification on a correlated subquery
      // used as a projection value) passed every filter-only assertion
      // while showing the wrong status to the founder in the browser.
      assert.equal(page.developers[0].verificationStatus, status);
    }

    // Total count reflects the active status filter (case 7): the full
    // token-scoped set is 6, but each individual granular filter narrows
    // it to exactly 1.
    const unfiltered = await getDeveloperIntelligence({ search: token, pageSize: 20, page: 1 });
    assert.equal(unfiltered.totalCount, 6, "clearing the status filter (status omitted) restores all 6 token-scoped developers");

    const displayedStatusById = new Map(unfiltered.developers.map((d) => [d.developerId, d.verificationStatus]));
    for (const [status, expectedDeveloperId] of cases) {
      assert.equal(
        displayedStatusById.get(expectedDeveloperId),
        status,
        `unfiltered list must display the correct status for ${expectedDeveloperId}`,
      );
    }
  },
);

test(
  "getDeveloperIntelligence: search + status filter work together",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveAndPublishCandidate } = await import("../../developer-connect/verification-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    const verifiedDev = await makeDeveloper(createDeveloper, repos, token, "Zylo Verified");
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: verifiedDev.id,
      url: `https://www.zylo-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, candidate.id, founder, "Looks correct");

    const discoveredDev = await makeDeveloper(createDeveloper, repos, token, "Zylo Discovered");
    await submitWebsiteCandidate(repos, {
      developerId: discoveredDev.id,
      url: `https://www.zylo-other-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    // Search alone (the token is a contiguous substring of both display names).
    const searchOnly = await getDeveloperIntelligence({ search: token, pageSize: 10, page: 1 });
    assert.equal(searchOnly.totalCount, 2);

    // Search + status narrows to just the verified one.
    const searchAndStatus = await getDeveloperIntelligence({
      search: token,
      status: "VERIFIED",
      pageSize: 10,
      page: 1,
    });
    assert.deepEqual(searchAndStatus.developers.map((d) => d.developerId), [verifiedDev.id]);
    assert.equal(searchAndStatus.totalCount, 1);

    // A search term that only matches the discovered one, combined with a
    // status that only matches the verified one, correctly matches nothing.
    const noMatch = await getDeveloperIntelligence({
      search: `Zylo Discovered ${token}`,
      status: "VERIFIED",
      pageSize: 10,
      page: 1,
    });
    assert.equal(noMatch.totalCount, 0);
  },
);

test(
  "getDeveloperIntelligence: status filter + pagination work together — no overlap, stable totalCount",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    const created: string[] = [];
    for (const label of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) {
      const dev = await makeDeveloper(createDeveloper, repos, token, `Disc ${label}`);
      await submitWebsiteCandidate(repos, {
        developerId: dev.id,
        url: `https://www.disc-${label.toLowerCase()}-${token}.example`,
        discoverySource: "MANUAL_SUBMISSION",
        actor: founder,
      });
      created.push(dev.id);
    }

    const seen = new Set<string>();
    let totalCountReported = -1;
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const page = await getDeveloperIntelligence({
        search: token,
        status: "DISCOVERED",
        page: pageNum,
        pageSize: 2,
      });
      if (pageNum === 1) totalCountReported = page.totalCount;
      assert.equal(page.totalCount, totalCountReported, "totalCount must stay identical across pages of the same filter");
      if (page.developers.length === 0) break;
      for (const d of page.developers) {
        assert.ok(!seen.has(d.developerId), "no developer should appear on more than one page");
        seen.add(d.developerId);
      }
    }

    assert.equal(totalCountReported, created.length);
    assert.equal(seen.size, created.length);
  },
);

test(
  "getDeveloperIntelligence: public verified-only visibility is unaffected by the status-filter fix",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { searchPublicDevelopers } = await import("../../developer-connect/search-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    const discoveredDev = await makeDeveloper(createDeveloper, repos, token, "PublicCheck Discovered");
    await submitWebsiteCandidate(repos, {
      developerId: discoveredDev.id,
      url: `https://www.publiccheck-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    // The admin status filter now correctly identifies this developer as
    // DISCOVERED (previously it only ever reported null) — but public
    // search must still treat it exactly as before: not visible, because
    // it has no VERIFIED candidate.
    const results = await searchPublicDevelopers(repos, `PublicCheck Discovered ${token}`);
    assert.deepEqual(results, []);
  },
);

test(
  "verification-service: FOUNDER-only authorization on state-changing actions is unaffected by the status-filter fix",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveCandidate } = await import("../../developer-connect/verification-service.ts");
    const { UnauthorizedVerificationActionError } = await import("../../developer-connect/errors.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    const dev = await makeDeveloper(createDeveloper, repos, token, "AuthCheck Co");
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: dev.id,
      url: `https://www.authcheck-${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    await assert.rejects(
      () => approveCandidate(repos, candidate.id, { actorType: "SYSTEM", actorId: "not-a-founder" }, "should be rejected"),
      UnauthorizedVerificationActionError,
    );
  },
);
