import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";

/**
 * Real-database counterpart to notification-service.test.ts — confirms
 * ownership enforcement and unread-count queries against real Postgres,
 * not just the in-memory Map. Skipped unless TEST_DATABASE_URL is set.
 */
test(
  "postgres notifications: created unread, listed newest-first, and unread count is scoped per user",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresNotificationRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresNotificationRepository();
    const userId = `test-user-${randomUUID()}`;
    const otherUserId = `test-user-${randomUUID()}`;

    await repo.create({ userId, type: "PROFILE_COMPLETION", title: "First", body: "..." });
    await repo.create({ userId, type: "PROFILE_COMPLETION", title: "Second", body: "..." });
    await repo.create({ userId: otherUserId, type: "PROFILE_COMPLETION", title: "Other", body: "..." });

    const list = await repo.listForUser(userId);
    assert.equal(list.length, 2);
    assert.equal(list[0].title, "Second");
    assert.equal(await repo.countUnreadForUser(userId), 2);
    assert.equal(await repo.countUnreadForUser(otherUserId), 1);
  },
);

test(
  "postgres notifications: markRead only succeeds for the owning user; a foreign id/user pair is a no-op",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresNotificationRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresNotificationRepository();
    const userId = `test-user-${randomUUID()}`;
    const otherUserId = `test-user-${randomUUID()}`;

    const created = await repo.create({
      userId,
      type: "PROFILE_COMPLETION",
      title: "Mine",
      body: "...",
    });

    const wrongOwnerResult = await repo.markRead(created.id, otherUserId);
    assert.equal(wrongOwnerResult, null);
    assert.equal(await repo.countUnreadForUser(userId), 1);

    const correctResult = await repo.markRead(created.id, userId);
    assert.equal(correctResult?.read, true);
    assert.ok(correctResult?.readAt);
    assert.equal(await repo.countUnreadForUser(userId), 0);
  },
);

test(
  "postgres notifications: hasUnreadOfType reflects real read state",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresNotificationRepository } = await import("../postgres-repository.ts");
    const repo = createPostgresNotificationRepository();
    const userId = `test-user-${randomUUID()}`;

    assert.equal(await repo.hasUnreadOfType(userId, "PROFILE_COMPLETION"), false);
    const created = await repo.create({
      userId,
      type: "PROFILE_COMPLETION",
      title: "A",
      body: "...",
    });
    assert.equal(await repo.hasUnreadOfType(userId, "PROFILE_COMPLETION"), true);

    await repo.markRead(created.id, userId);
    assert.equal(await repo.hasUnreadOfType(userId, "PROFILE_COMPLETION"), false);
  },
);
