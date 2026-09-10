import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../test-db-guard.ts";

/**
 * These tests exercise the real PostgreSQL adapter and the database-level
 * constraints from the migrations (unique slug, the partial unique index
 * on VERIFIED candidates, and the append-only trigger). They require a
 * real, disposable database and are skipped entirely when TEST_DATABASE_URL
 * is not set.
 *
 * `test-db-guard.ts` (imported above, first, before any import that could
 * touch `client.ts`) refuses outright if TEST_DATABASE_URL would resolve
 * to the same database as DATABASE_URL, and otherwise points the app's
 * normal DATABASE_URL at the disposable test database for this process
 * only — so these tests exercise the exact same `createPostgresRepositories()`
 * production code path, just aimed at a database that is safe to write
 * "TEST —" rows into and never claim to be clean.
 */
const hasDatabase = hasTestDatabase;

test(
  "postgres: developer slugs are unique at the database level, not just in application code",
  { skip: !hasDatabase },
  async () => {
    const { getDb } = await import("../client.ts");
    const { developers } = await import("../schema.ts");
    const db = getDb();
    const slug = `test-integration-${randomUUID()}`;

    await db.insert(developers).values({
      id: randomUUID(),
      legalName: "TEST — Duplicate Slug Co",
      displayName: "TEST — Duplicate Slug Co",
      slug,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    await assert.rejects(() =>
      db.insert(developers).values({
        id: randomUUID(),
        legalName: "TEST — Duplicate Slug Co 2",
        displayName: "TEST — Duplicate Slug Co 2",
        slug,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      }),
    );
  },
);

test(
  "postgres: at most one VERIFIED candidate per developer is enforced by the database itself",
  { skip: !hasDatabase },
  async () => {
    const { getDb } = await import("../client.ts");
    const { developers, websiteCandidates } = await import("../schema.ts");
    const db = getDb();

    const [developer] = await db
      .insert(developers)
      .values({
        id: randomUUID(),
        legalName: "TEST — Two Verified Co",
        displayName: "TEST — Two Verified Co",
        slug: `test-two-verified-${randomUUID()}`,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      })
      .returning();

    await db.insert(websiteCandidates).values({
      id: randomUUID(),
      developerId: developer.id,
      url: "https://one.example.com",
      canonicalDomain: "one.example.com",
      discoverySource: "MANUAL_SUBMISSION",
      verificationStatus: "VERIFIED",
    });

    // Attempting to insert a second VERIFIED row for the same developer,
    // bypassing verification-service.ts entirely, must still fail — this
    // is the invariant the partial unique index exists to guarantee.
    await assert.rejects(() =>
      db.insert(websiteCandidates).values({
        id: randomUUID(),
        developerId: developer.id,
        url: "https://two.example.com",
        canonicalDomain: "two.example.com",
        discoverySource: "MANUAL_SUBMISSION",
        verificationStatus: "VERIFIED",
      }),
    );
  },
);

test(
  "postgres: verification_events rejects UPDATE and DELETE at the database level",
  { skip: !hasDatabase },
  async () => {
    const { getDb } = await import("../client.ts");
    const { developers, websiteCandidates, verificationEvents } = await import("../schema.ts");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const [developer] = await db
      .insert(developers)
      .values({
        id: randomUUID(),
        legalName: "TEST — Append Only Co",
        displayName: "TEST — Append Only Co",
        slug: `test-append-only-${randomUUID()}`,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
      })
      .returning();

    const [candidate] = await db
      .insert(websiteCandidates)
      .values({
        id: randomUUID(),
        developerId: developer.id,
        url: "https://append-only.example.com",
        canonicalDomain: "append-only.example.com",
        discoverySource: "MANUAL_SUBMISSION",
      })
      .returning();

    const [event] = await db
      .insert(verificationEvents)
      .values({
        id: randomUUID(),
        websiteCandidateId: candidate.id,
        previousStatus: null,
        newStatus: "DISCOVERED",
        reason: "Submitted via MANUAL_SUBMISSION",
        actorType: "FOUNDER",
        actorId: "test-founder",
      })
      .returning();

    await assert.rejects(() =>
      db
        .update(verificationEvents)
        .set({ reason: "tampered" })
        .where(eq(verificationEvents.id, event.id)),
    );
    await assert.rejects(() =>
      db.delete(verificationEvents).where(eq(verificationEvents.id, event.id)),
    );
  },
);

test(
  "postgres: end-to-end submit + approve through the real repositories and services",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../candidate-service.ts");
    const { approveCandidate, markReadyForReview } = await import("../../verification-service.ts");

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

    const developer = await createDeveloper(repos.developers, {
      legalName: "TEST — End To End Co",
      displayName: `TEST — End To End Co ${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    // Domains are unique per run (not just the developer name above) —
    // the cross-developer VERIFIED-domain guard in approveCandidate now
    // means a fixed domain reused across repeated test runs against this
    // shared, never-truncated test database would collide with a leftover
    // VERIFIED candidate from an earlier run and fail for the wrong reason.
    const runId = randomUUID();

    const first = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://first-${runId}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, first.id, founder);
    await approveCandidate(repos, first.id, founder, "Confirmed via WHOIS");

    const second = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://second-${runId}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, second.id, founder);
    const verifiedSecond = await approveCandidate(repos, second.id, founder, "Developer moved domains");

    const refreshedFirst = await repos.candidates.getById(first.id);
    const currentlyVerified = await repos.candidates.getVerifiedForDeveloper(developer.id);

    assert.equal(refreshedFirst?.verificationStatus, "INACTIVE");
    assert.equal(verifiedSecond.verificationStatus, "VERIFIED");
    assert.equal(currentlyVerified?.id, second.id);
  },
);

test(
  "postgres: a website candidate cannot reference a nonexistent developer (foreign key integrity)",
  { skip: !hasDatabase },
  async () => {
    const { getDb } = await import("../client.ts");
    const { websiteCandidates } = await import("../schema.ts");
    const db = getDb();

    await assert.rejects(() =>
      db.insert(websiteCandidates).values({
        id: randomUUID(),
        developerId: randomUUID(), // does not exist
        url: "https://orphan.example.com",
        canonicalDomain: "orphan.example.com",
        discoverySource: "MANUAL_SUBMISSION",
      }),
    );
  },
);

test(
  "postgres: a rejected candidate remains historically queryable, not deleted",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../candidate-service.ts");
    const { rejectCandidate } = await import("../../verification-service.ts");

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

    const developer = await createDeveloper(repos.developers, {
      legalName: "TEST — Rejected History Co",
      displayName: `TEST — Rejected History Co ${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const candidate = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: "https://not-official.example.com",
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await rejectCandidate(repos, candidate.id, founder, "Confirmed to be a broker's site");

    const stillThere = await repos.candidates.getById(candidate.id);
    const inDeveloperList = await repos.candidates.listByDeveloper(developer.id);
    const history = await repos.events.listByCandidate(candidate.id);

    assert.equal(stillThere?.verificationStatus, "REJECTED");
    assert.equal(stillThere?.rejectionReason, "Confirmed to be a broker's site");
    assert.ok(inDeveloperList.some((c) => c.id === candidate.id));
    assert.ok(history.some((e) => e.newStatus === "REJECTED"));
  },
);

test(
  "postgres: a failed approve transaction rolls back completely — the previously verified candidate is left untouched",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-service.ts");
    const { submitWebsiteCandidate } = await import("../../candidate-service.ts");
    const { approveCandidate, markReadyForReview } = await import("../../verification-service.ts");
    const { InvalidTransitionError } = await import("../../errors.ts");

    const repos = createPostgresRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

    const developer = await createDeveloper(repos.developers, {
      legalName: "TEST — Rollback Co",
      displayName: `TEST — Rollback Co ${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    // Domains are unique per run for the same reason as the end-to-end
    // test above — see its comment.
    const runId = randomUUID();

    const candidateA = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://a-${runId}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });
    await markReadyForReview(repos, candidateA.id, founder);
    await approveCandidate(repos, candidateA.id, founder, "Confirmed via WHOIS");

    // Candidate B is deliberately left in DISCOVERED (not PENDING_VERIFICATION),
    // so approving it is an illegal lifecycle transition. The first half of
    // approveCandidate's work — retiring candidate A to INACTIVE — still
    // executes before that failure. If the transaction is real, that write
    // must be undone along with everything else.
    const candidateB = await submitWebsiteCandidate(repos, {
      developerId: developer.id,
      url: `https://b-${runId}.example.com`,
      discoverySource: "MANUAL_SUBMISSION",
      actor: founder,
    });

    await assert.rejects(
      () => approveCandidate(repos, candidateB.id, founder, "should fail"),
      InvalidTransitionError,
    );

    const refreshedA = await repos.candidates.getById(candidateA.id);
    const refreshedB = await repos.candidates.getById(candidateB.id);
    const currentlyVerified = await repos.candidates.getVerifiedForDeveloper(developer.id);

    assert.equal(refreshedA?.verificationStatus, "VERIFIED", "candidate A must still be VERIFIED — the failed transaction must not have partially applied");
    assert.equal(refreshedB?.verificationStatus, "DISCOVERED", "candidate B must be untouched");
    assert.equal(currentlyVerified?.id, candidateA.id);
  },
);

test(
  "postgres: developer search is case-insensitive and matches partial names via real ILIKE",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-service.ts");

    const repos = createPostgresRepositories();
    const uniqueMarker = randomUUID().slice(0, 8);
    await createDeveloper(repos.developers, {
      legalName: `TEST — Search Co ${uniqueMarker} Private Limited`,
      displayName: `TEST — Search Co ${uniqueMarker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const lowerCaseMatch = await repos.developers.search(`search co ${uniqueMarker}`.toLowerCase());
    const partialMatch = await repos.developers.search(uniqueMarker);

    assert.equal(lowerCaseMatch.length, 1);
    assert.equal(partialMatch.length, 1);
  },
);

test(
  "postgres: search input containing LIKE wildcard characters is matched literally, not as a pattern",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const { createDeveloper } = await import("../../developer-service.ts");

    const repos = createPostgresRepositories();
    const uniqueMarker = randomUUID().slice(0, 8);
    await createDeveloper(repos.developers, {
      legalName: `TEST — 100% Wildcard Co ${uniqueMarker}`,
      displayName: `TEST — 100% Wildcard Co ${uniqueMarker}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const literalMatch = await repos.developers.search(`100% Wildcard Co ${uniqueMarker}`);
    const unrelatedQuery = await repos.developers.search(`zzz-unrelated-${uniqueMarker}`);

    assert.equal(literalMatch.length, 1);
    assert.equal(unrelatedQuery.length, 0);
  },
);

test(
  "postgres: the analytics sink records a real official_website_clicked event",
  { skip: !hasDatabase },
  async () => {
    const { getDb } = await import("../client.ts");
    const { analyticsEvents } = await import("../schema.ts");
    const { postgresAnalyticsSink } = await import("../postgres-analytics-sink.ts");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    const developerId = randomUUID();
    const sessionId = `test-session-${randomUUID()}`;

    await postgresAnalyticsSink.record({
      eventName: "official_website_clicked",
      occurredAt: new Date(),
      sessionId,
      deviceType: "mobile",
      developerId,
      targetDomain: "example.com",
    });

    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.sessionId, sessionId));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].eventName, "official_website_clicked");
    assert.equal(rows[0].developerId, developerId);
    assert.deepEqual(rows[0].payload, { targetDomain: "example.com", deviceType: "mobile" });
  },
);

test(
  "postgres: getById returns null (not a thrown error) for a malformed, non-UUID id",
  { skip: !hasDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../postgres-repository.ts");
    const repos = createPostgresRepositories();

    assert.equal(await repos.developers.getById("not-a-uuid"), null);
    assert.equal(await repos.candidates.getById("also-not-a-uuid"), null);
  },
);

test.after(async () => {
  if (!hasDatabase) return;
  const { closeDb } = await import("../client.ts");
  await closeDb();
});
