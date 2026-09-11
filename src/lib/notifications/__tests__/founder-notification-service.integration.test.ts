import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Real Clerk Backend API + real (disposable) profile database. Clerk
 * itself isn't environment-split in this project — the same real
 * accounts exist regardless of which Postgres database is targeted — so
 * this deliberately asserts structural correctness (real shape, real
 * wiring) rather than exact counts/percentages, which would make the
 * test fragile to whichever real accounts happen to exist when it runs.
 */
test(
  "resolveFounderAudience: ALL audience returns real Clerk users joined with real profile completion, never fabricated",
  { skip: !hasTestDatabase || !process.env.CLERK_SECRET_KEY },
  async () => {
    const { resolveFounderAudience } = await import("../founder-notification-service.ts");
    const { createPostgresProfileRepository } = await import("../../profile/db/postgres-repository.ts");

    const profileRepo = createPostgresProfileRepository();
    const recipients = await resolveFounderAudience(profileRepo, { kind: "ALL" });

    assert.ok(Array.isArray(recipients));
    assert.ok(recipients.length > 0, "expected at least the real accounts used throughout this project's testing");
    for (const recipient of recipients) {
      assert.ok(typeof recipient.userId === "string" && recipient.userId.startsWith("user_"));
      assert.ok(typeof recipient.displayName === "string" && recipient.displayName.length > 0);
      assert.ok(recipient.completion.percentage === null || typeof recipient.completion.percentage === "number");
      assert.ok(Array.isArray(recipient.completion.sections));
    }
  },
);

test(
  "resolveFounderAudience + sendFounderNotification: a real end-to-end send persists a real FOUNDER_MESSAGE row for a real user",
  { skip: !hasTestDatabase || !process.env.CLERK_SECRET_KEY },
  async () => {
    const { resolveFounderAudience, sendFounderNotification } = await import("../founder-notification-service.ts");
    const { createPostgresProfileRepository } = await import("../../profile/db/postgres-repository.ts");
    const { createPostgresNotificationRepository } = await import("../db/postgres-repository.ts");

    const profileRepo = createPostgresProfileRepository();
    const notificationRepo = createPostgresNotificationRepository();

    const all = await resolveFounderAudience(profileRepo, { kind: "ALL" });
    assert.ok(all.length > 0);
    const target = all[0];

    const result = await sendFounderNotification(notificationRepo, [target], {
      purpose: "GENERAL",
      title: "Integration test message",
      body: "This is a real, disposable-database-only test notification.",
    });

    assert.equal(result.recipientCount, 1);
    assert.equal(result.sentCount, 1);

    const history = await notificationRepo.listByType("FOUNDER_MESSAGE", 200);
    const found = history.find((n) => n.id === result.notifications[0].id);
    assert.ok(found, "the sent notification must be readable back via listByType");
    assert.equal(found?.userId, target.userId);
    assert.equal(found?.title, "Integration test message");

    // Clean up — this test writes one real row to the disposable test
    // database's notifications table; mark it read so it doesn't linger
    // as a real-looking unread notification for whoever owns that account.
    await notificationRepo.markRead(result.notifications[0].id, target.userId);
  },
);
