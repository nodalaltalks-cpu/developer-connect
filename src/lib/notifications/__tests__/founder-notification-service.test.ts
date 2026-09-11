import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryNotificationRepository } from "../memory-repository.ts";
import { createInMemoryProfileRepository } from "../../profile/memory-repository.ts";
import {
  resolveFounderAudience,
  sendFounderNotification,
  composeFounderMessage,
} from "../founder-notification-service.ts";
import { PROFILE_FIELD_CONFIG } from "../../profile/field-config.ts";

/** resolveFounderAudience's INDIVIDUAL path calls the real Clerk Backend API — only meaningful with real credentials against the test database's Clerk instance. */
const hasClerkCredentials = Boolean(process.env.CLERK_SECRET_KEY);

/**
 * These tests fake only the Clerk boundary (listAllClerkUsers/getClerkUser
 * pull from the real network in production) — everything else here is
 * the real profile repository, the real calculateProfileCompletion, and
 * the real PROFILE_SECTIONS. Since resolveFounderAudience's non-INDIVIDUAL
 * paths call the real listAllClerkUsers(), which needs network access,
 * those paths are exercised via composeFounderMessage/sendFounderNotification
 * directly with hand-built ResolvedRecipient objects instead — the exact
 * shape resolveFounderAudience itself produces, so this still tests the
 * real downstream logic without needing live Clerk credentials in a unit
 * test.
 */

function dataMissingOnly(exceptKeys: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of PROFILE_FIELD_CONFIG) {
    if (!exceptKeys.includes(field.key)) data[field.key] = "x";
  }
  return data;
}

test("composeFounderMessage: COMPLETE_SECTION uses the real PROFILE_SECTIONS title and whyItMatters copy, never a second hardcoded list", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const recipient = {
    userId: "user-1",
    displayName: "Ambish Singh",
    firstName: "Ambish",
    completion: calculateProfileCompletion({}),
  };

  const message = composeFounderMessage(recipient, { purpose: "COMPLETE_SECTION", sectionId: "preferred-locations" });
  assert.ok(message);
  assert.equal(message!.targetRoute, "/profile?section=preferred-locations");
  assert.ok(message!.body.toLowerCase().includes("preferred locations"));
  assert.ok(message!.body.includes("Ambish,"));
});

test("composeFounderMessage: COMPLETE_SECTION returns null for a section id that doesn't exist — never invents one", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const recipient = {
    userId: "user-1",
    displayName: "Test User",
    firstName: "Test",
    completion: calculateProfileCompletion({}),
  };
  const message = composeFounderMessage(recipient, { purpose: "COMPLETE_SECTION", sectionId: "not-a-real-section" });
  assert.equal(message, null);
});

test("composeFounderMessage: COMPLETE_PROFILE names this recipient's own real percentage and own next incomplete section", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const data = dataMissingOnly(["preferredLocations"]);
  const completion = calculateProfileCompletion(data);
  const recipient = { userId: "user-1", displayName: "Priya Shah", firstName: "Priya", completion };

  const message = composeFounderMessage(recipient, { purpose: "COMPLETE_PROFILE" });
  assert.ok(message);
  assert.ok(message!.body.includes(`${completion.percentage}%`));
  assert.ok(message!.body.toLowerCase().includes("preferred locations"));
  assert.equal(message!.targetRoute, "/profile?section=preferred-locations");
});

test("composeFounderMessage: COMPLETE_PROFILE returns null once the recipient is already at 100% — nothing left to nudge about", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const completion = calculateProfileCompletion(dataMissingOnly([]));
  assert.equal(completion.percentage, 100);
  const recipient = { userId: "user-1", displayName: "Done User", firstName: "Done", completion };

  assert.equal(composeFounderMessage(recipient, { purpose: "COMPLETE_PROFILE" }), null);
});

test("composeFounderMessage: GENERAL uses exactly the founder's own title and body, untouched", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const recipient = {
    userId: "user-1",
    displayName: "Test User",
    firstName: "Test",
    completion: calculateProfileCompletion({}),
  };
  const message = composeFounderMessage(recipient, {
    purpose: "GENERAL",
    title: "We're live in Pune",
    body: "Developer Connect now covers Pune too.",
  });
  assert.deepEqual(message, {
    title: "We're live in Pune",
    body: "Developer Connect now covers Pune too.",
    targetRoute: null,
  });
});

test("sendFounderNotification: persists one real notification per recipient, correctly targeting each userId", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const notificationRepo = createInMemoryNotificationRepository();
  const data = dataMissingOnly(["budgetRange"]);
  const completion = calculateProfileCompletion(data);

  const recipients = [
    { userId: "user-a", displayName: "User A", firstName: "A", completion },
    { userId: "user-b", displayName: "User B", firstName: "B", completion },
  ];

  const result = await sendFounderNotification(notificationRepo, recipients, {
    purpose: "COMPLETE_SECTION",
    sectionId: "budget",
  });

  assert.equal(result.recipientCount, 2);
  assert.equal(result.sentCount, 2);
  assert.equal(result.skippedDuplicateCount, 0);

  const forA = await notificationRepo.listForUser("user-a");
  const forB = await notificationRepo.listForUser("user-b");
  assert.equal(forA.length, 1);
  assert.equal(forB.length, 1);
  assert.equal(forA[0].type, "FOUNDER_MESSAGE");
  assert.equal(forA[0].targetRoute, "/profile?section=budget");
  // Each recipient's own notification row, never shared or cross-assigned.
  assert.notEqual(forA[0].id, forB[0].id);
});

test("sendFounderNotification: skips a recipient who already has an unread notification pointing at the same destination (deterministic dedup)", async () => {
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const notificationRepo = createInMemoryNotificationRepository();
  const completion = calculateProfileCompletion({});
  const recipient = { userId: "user-a", displayName: "User A", firstName: "A", completion };

  const first = await sendFounderNotification(notificationRepo, [recipient], {
    purpose: "COMPLETE_SECTION",
    sectionId: "budget",
  });
  assert.equal(first.sentCount, 1);

  const second = await sendFounderNotification(notificationRepo, [recipient], {
    purpose: "COMPLETE_SECTION",
    sectionId: "budget",
  });
  assert.equal(second.sentCount, 0);
  assert.equal(second.skippedDuplicateCount, 1);

  const all = await notificationRepo.listForUser("user-a");
  assert.equal(all.length, 1, "no duplicate row was created");
});

test("sendFounderNotification: a GENERAL message has no targetRoute, so it is never deduplicated away — repeat sends are allowed", async () => {
  const notificationRepo = createInMemoryNotificationRepository();
  const { calculateProfileCompletion } = await import("../../profile/completion.ts");
  const recipient = {
    userId: "user-a",
    displayName: "User A",
    firstName: "A",
    completion: calculateProfileCompletion({}),
  };
  const message = { purpose: "GENERAL" as const, title: "Hi", body: "Just checking in." };

  await sendFounderNotification(notificationRepo, [recipient], message);
  await sendFounderNotification(notificationRepo, [recipient], message);

  assert.equal((await notificationRepo.listForUser("user-a")).length, 2);
});

test("sendFounderNotification: zero recipients means zero sends, never an error and never a fabricated recipient", async () => {
  const notificationRepo = createInMemoryNotificationRepository();
  const result = await sendFounderNotification(notificationRepo, [], { purpose: "GENERAL", title: "Hi", body: "Hi" });
  assert.equal(result.recipientCount, 0);
  assert.equal(result.sentCount, 0);
});

test(
  "resolveFounderAudience: INDIVIDUAL audience for an unknown Clerk id resolves to zero recipients, not an error",
  { skip: !hasClerkCredentials },
  async () => {
    const profileRepo = createInMemoryProfileRepository();
    const recipients = await resolveFounderAudience(profileRepo, {
      kind: "INDIVIDUAL",
      userId: "user_does_not_exist_in_clerk",
    });
    assert.deepEqual(recipients, []);
  },
);
