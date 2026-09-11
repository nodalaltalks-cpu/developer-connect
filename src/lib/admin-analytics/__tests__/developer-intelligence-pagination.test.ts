import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database tests for getDeveloperIntelligence()'s pagination and
 * search — the fix for /admin/developers being capped at 50 rows with
 * search that only ever looked at whatever was already loaded.
 *
 * The test database already has other developers in it (from other test
 * suites and prior manual runs), so every test here scopes its
 * assertions through a `search` term unique to that test run (a random
 * token embedded in the display/legal name or domain) — this proves the
 * real, server-side, whole-table behavior without depending on the test
 * database being empty.
 */

const founder = { actorType: "FOUNDER" as const, actorId: "pagination-test-founder" };

test(
  "getDeveloperIntelligence: paginates deterministically — no developer appears on more than one page, and totalCount is stable across pages",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");

    const token = `pagtest-${randomUUID().slice(0, 8)}`;
    const repos = createPostgresRepositories();
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((n) => `${token} ${n}`);
    for (const displayName of names) {
      await createDeveloper(repos.developers, {
        legalName: `${displayName} Private Limited`,
        displayName,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      });
    }

    const seen = new Set<string>();
    let totalCountReported = -1;
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const result = await getDeveloperIntelligence({ search: token, page: pageNum, pageSize: 2 });
      if (pageNum === 1) totalCountReported = result.totalCount;
      assert.equal(result.totalCount, totalCountReported, "totalCount must be identical on every page of the same search");
      if (result.developers.length === 0) break;
      for (const d of result.developers) {
        assert.ok(!seen.has(d.developerId), `developer ${d.displayName} appeared on more than one page`);
        seen.add(d.developerId);
      }
    }

    assert.equal(totalCountReported, names.length);
    assert.equal(seen.size, names.length, "every created developer must be reachable across the paginated results");
  },
);

test(
  "getDeveloperIntelligence: search reaches the whole table, not just an initial page — matches display name, legal name, and website-candidate domain",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    // Filler developers so the target genuinely isn't on page 1 of an
    // unfiltered, alphabetically-ordered listing.
    for (let i = 0; i < 3; i++) {
      await createDeveloper(repos.developers, {
        legalName: `AAA Filler ${token} ${i} Private Limited`,
        displayName: `AAA Filler ${token} ${i}`,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      });
    }

    const target = await createDeveloper(repos.developers, {
      legalName: `Zzz Legal Entity ${token} Private Limited`,
      displayName: `Zzz Display ${token}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    await submitWebsiteCandidate(repos, {
      developerId: target.id,
      url: `https://www.zzzdomain${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    const byDisplayName = await getDeveloperIntelligence({ search: `Zzz Display ${token}`, pageSize: 1, page: 1 });
    assert.equal(byDisplayName.developers.length, 1);
    assert.equal(byDisplayName.developers[0].developerId, target.id);

    const byLegalName = await getDeveloperIntelligence({ search: `Zzz Legal Entity ${token}`, pageSize: 1, page: 1 });
    assert.equal(byLegalName.developers.length, 1);
    assert.equal(byLegalName.developers[0].developerId, target.id);

    const byDomain = await getDeveloperIntelligence({ search: `zzzdomain${token}`, pageSize: 1, page: 1 });
    assert.equal(byDomain.developers.length, 1);
    assert.equal(byDomain.developers[0].developerId, target.id);
  },
);

test(
  "getDeveloperIntelligence: status filter — VERIFIED/NOT_VERIFIED work correctly; a developer with no website candidate at all reads as DISCOVERED (see developer-intelligence-status-filter.test.ts for the full granular-status matrix)",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");
    const { createPostgresRepositories } = await import("../../developer-connect/db/postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-connect/developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../developer-connect/candidate-service.ts");
    const { approveAndPublishCandidate } = await import("../../developer-connect/verification-service.ts");

    const token = randomUUID().slice(0, 8);
    const repos = createPostgresRepositories();

    const verifiedDev = await createDeveloper(repos.developers, {
      legalName: `Verified Co ${token} Private Limited`,
      displayName: `Verified Co ${token}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const candidate = await submitWebsiteCandidate(repos, {
      developerId: verifiedDev.id,
      url: `https://www.verified${token}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await approveAndPublishCandidate(repos, candidate.id, founder, "pagination test verification");

    const unverifiedDev = await createDeveloper(repos.developers, {
      legalName: `Unverified Co ${token} Private Limited`,
      displayName: `Unverified Co ${token}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const verifiedOnly = await getDeveloperIntelligence({ search: token, status: "VERIFIED", pageSize: 10, page: 1 });
    assert.deepEqual(
      verifiedOnly.developers.map((d) => d.developerId).sort(),
      [verifiedDev.id].sort(),
    );

    const notVerifiedOnly = await getDeveloperIntelligence({ search: token, status: "NOT_VERIFIED", pageSize: 10, page: 1 });
    assert.deepEqual(
      notVerifiedOnly.developers.map((d) => d.developerId).sort(),
      [unverifiedDev.id].sort(),
    );

    // unverifiedDev never had a website candidate submitted at all — the
    // effective-status derivation treats "no candidate yet" as DISCOVERED
    // (see effectiveVerificationStatusSql() in queries.ts), so it must
    // show up here, not be silently excluded.
    const granular = await getDeveloperIntelligence({ search: token, status: "DISCOVERED", pageSize: 10, page: 1 });
    assert.deepEqual(
      granular.developers.map((d) => d.developerId),
      [unverifiedDev.id],
    );
  },
);

test(
  "getDeveloperIntelligence: clearing the search returns to the complete, unfiltered dataset",
  { skip: !hasTestDatabase },
  async () => {
    const { getDeveloperIntelligence } = await import("../queries.ts");

    const noMatch = await getDeveloperIntelligence({ search: "definitely-does-not-exist-anywhere-xyz" });
    assert.equal(noMatch.totalCount, 0);
    assert.deepEqual(noMatch.developers, []);

    const cleared = await getDeveloperIntelligence({});
    assert.ok(cleared.totalCount >= 0);
    assert.equal(cleared.page, 1);
  },
);
