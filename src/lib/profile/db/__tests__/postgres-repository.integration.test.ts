import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database counterpart to profile-service.test.ts — confirms the
 * Postgres JSONB merge (`||`) actually behaves as a partial update, not
 * an overwrite, against a real database rather than the in-memory Map.
 * Skipped unless TEST_DATABASE_URL is set (see test-db-guard.ts).
 */
test(
  "postgres profiles: updateFields merges into existing data via JSONB, never overwrites unrelated keys",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresProfileRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresProfileRepository();
    const userId = `test-user-${randomUUID()}`;

    await repo.updateFields(userId, { fieldA: "first" });
    await repo.updateFields(userId, { fieldB: "second" });
    const afterTwoUpdates = await repo.getByUserId(userId);
    assert.deepEqual(afterTwoUpdates?.data, { fieldA: "first", fieldB: "second" });

    await repo.updateFields(userId, { fieldA: "updated" });
    const afterThirdUpdate = await repo.getByUserId(userId);
    assert.deepEqual(afterThirdUpdate?.data, { fieldA: "updated", fieldB: "second" });
  },
);

test(
  "postgres profiles: createIfMissing is idempotent and never resets existing data",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresProfileRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresProfileRepository();
    const userId = `test-user-${randomUUID()}`;

    await repo.updateFields(userId, { fieldA: "value" });
    const created = await repo.createIfMissing(userId);
    assert.deepEqual(created.data, { fieldA: "value" });
  },
);

test(
  "postgres profiles: getManyByUserIds batches a lookup, skipping ids with no profile row and an empty list",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresProfileRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresProfileRepository();
    const userA = `test-user-${randomUUID()}`;
    const userB = `test-user-${randomUUID()}`;
    const userWithNoProfile = `test-user-${randomUUID()}`;

    await repo.updateFields(userA, { fieldA: "a" });
    await repo.updateFields(userB, { fieldA: "b" });

    const results = await repo.getManyByUserIds([userA, userB, userWithNoProfile]);
    assert.equal(results.length, 2);
    assert.deepEqual(
      results.map((p) => p.userId).sort(),
      [userA, userB].sort(),
    );

    assert.deepEqual(await repo.getManyByUserIds([]), []);
  },
);
