import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeContactStatus,
  composeContactStatusNotification,
  moveContactToTrash,
  restoreContactFromTrash,
  permanentlyDeleteContact,
  getContactHistory,
} from "../contact-service.ts";
import { createInMemoryEngagementRepositories } from "../memory-repository.ts";
import { createInMemoryNotificationRepository } from "../../notifications/memory-repository.ts";
import { NotFoundError } from "../../developer-connect/errors.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "test-founder" };

async function createSubmission(engagement: ReturnType<typeof createInMemoryEngagementRepositories>, overrides: { userId?: string | null } = {}) {
  return engagement.contact.create({
    name: "Test Visitor",
    email: "visitor@example.com",
    reason: "GENERAL_QUESTION",
    message: "Hello",
    userId: overrides.userId ?? null,
  });
}

// TEST 1: New Contact submission — OPEN, no history required to exist yet (history is created by explicit transitions, not by creation itself).
test("contact-service: a new submission starts OPEN", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await createSubmission(engagement);
  assert.equal(submission.status, "OPEN");
  assert.equal(submission.deletedAt, null);
});

// TEST 2-6: real transitions create exactly one history event and (when linked to a user) exactly one notification.
test("contact-service: OPEN -> IN_REVIEW creates a history event and a notification for a signed-in requester", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement, { userId: "user_123" });

  const result = await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);

  assert.equal(result.submission.status, "IN_REVIEW");
  assert.ok(result.historyEntry);
  assert.equal(result.historyEntry?.previousStatus, "OPEN");
  assert.equal(result.historyEntry?.newStatus, "IN_REVIEW");
  assert.equal(result.historyEntry?.actorType, "FOUNDER");
  assert.equal(result.historyEntry?.actorId, "test-founder");
  assert.equal(result.notificationSent, true);

  const userNotifications = await notifications.listForUser("user_123");
  assert.equal(userNotifications.length, 1);
  assert.equal(userNotifications[0].type, "CONTACT_STATUS_UPDATE");
  assert.equal(userNotifications[0].body, "Your Contact Us request is now under review.");
});

test("contact-service: IN_REVIEW -> ON_HOLD records the optional note in history and in the notification is never included verbatim", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement, { userId: "user_123" });
  await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);

  const result = await changeContactStatus(
    engagement,
    notifications,
    submission.id,
    "ON_HOLD",
    "Waiting for additional information",
    founder,
  );

  assert.equal(result.historyEntry?.note, "Waiting for additional information");
  const userNotifications = await notifications.listForUser("user_123");
  assert.equal(userNotifications.length, 2);
  const onHoldNotification = userNotifications.find((n) =>
    n.body.startsWith("Your Contact Us request is currently on hold"),
  );
  assert.ok(onHoldNotification, "an ON_HOLD notification must have been created");
  assert.equal(
    onHoldNotification?.body,
    "Your Contact Us request is currently on hold. We may need additional information before we can continue.",
  );
  assert.ok(
    !onHoldNotification?.body.includes("Waiting for additional information"),
    "the internal note must never appear in user-facing copy verbatim",
  );
});

test("contact-service: ON_HOLD -> IN_REVIEW is a real transition (distinct from OPEN and ON_HOLD) and creates its own history + notification", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement, { userId: "user_123" });
  await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);
  await changeContactStatus(engagement, notifications, submission.id, "ON_HOLD", "waiting", founder);

  const result = await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);

  assert.equal(result.submission.status, "IN_REVIEW");
  assert.equal(result.historyEntry?.previousStatus, "ON_HOLD");
  assert.equal(result.historyEntry?.newStatus, "IN_REVIEW");
  const history = await getContactHistory(engagement, submission.id);
  assert.equal(history.length, 3);
});

test("contact-service: IN_REVIEW -> RESOLVED and OPEN -> REJECTED both produce the exact specified user-facing copy", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();

  const resolvedSubmission = await createSubmission(engagement, { userId: "user_resolved" });
  await changeContactStatus(engagement, notifications, resolvedSubmission.id, "IN_REVIEW", null, founder);
  await changeContactStatus(engagement, notifications, resolvedSubmission.id, "RESOLVED", null, founder);
  const resolvedNotifications = await notifications.listForUser("user_resolved");
  assert.ok(resolvedNotifications.some((n) => n.body === "Your Contact Us request has been resolved."));

  const rejectedSubmission = await createSubmission(engagement, { userId: "user_rejected" });
  await changeContactStatus(engagement, notifications, rejectedSubmission.id, "REJECTED", "Not relevant", founder);
  const rejectedNotifications = await notifications.listForUser("user_rejected");
  assert.ok(
    rejectedNotifications.some((n) => n.body === "Your Contact Us request has been reviewed and could not be accepted."),
  );
});

// TEST 7 + Part 30: selecting the same status again must not duplicate history or notifications.
test("contact-service: selecting the currently-active status is a no-op — no duplicate history, no duplicate notification", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement, { userId: "user_123" });
  await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);

  const result = await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", "irrelevant note", founder);

  assert.equal(result.historyEntry, null);
  assert.equal(result.notificationSent, false);
  const history = await getContactHistory(engagement, submission.id);
  assert.equal(history.length, 1, "the idempotent re-selection must not add a second history event");
  const userNotifications = await notifications.listForUser("user_123");
  assert.equal(userNotifications.length, 1, "the idempotent re-selection must not send a second notification");
});

// TEST 14 + Part 22/24: anonymous requester (no userId) must never get a fabricated notification, but history/status must still work.
test("contact-service: an anonymous submission (no userId) still gets real status history, but never a fabricated notification", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement, { userId: null });

  const result = await changeContactStatus(engagement, notifications, submission.id, "RESOLVED", null, founder);

  assert.equal(result.submission.status, "RESOLVED");
  assert.ok(result.historyEntry);
  assert.equal(result.notificationSent, false, "there is no account to notify — this must never be faked");
});

test("contact-service: composeContactStatusNotification returns null for OPEN — no notification copy is defined for it", () => {
  const message = composeContactStatusNotification({ reason: "GENERAL_QUESTION" }, "OPEN");
  assert.equal(message, null);
});

test("contact-service: changing the status of a Trashed submission is refused", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  const submission = await createSubmission(engagement);
  await moveContactToTrash(engagement, submission.id, founder);

  await assert.rejects(() => changeContactStatus(engagement, notifications, submission.id, "RESOLVED", null, founder));
});

// TEST 8/9: Trash + Restore.
test("contact-service: moving to Trash removes a submission from the active list and records a TRASHED event; restoring reverses both", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await createSubmission(engagement);

  const trashed = await moveContactToTrash(engagement, submission.id, founder);
  assert.ok(trashed.deletedAt instanceof Date);
  assert.equal(trashed.deletedBy, "test-founder");
  assert.ok(!(await engagement.contact.list()).some((s) => s.id === submission.id));
  assert.ok((await engagement.contact.listTrash()).some((s) => s.id === submission.id));

  const restored = await restoreContactFromTrash(engagement, submission.id, founder);
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.deletedBy, null);
  assert.ok((await engagement.contact.list()).some((s) => s.id === submission.id));

  const history = await getContactHistory(engagement, submission.id);
  assert.deepEqual(
    history.map((h) => h.eventType).sort(),
    ["RESTORED", "TRASHED"],
  );
});

test("contact-service: moving an already-trashed submission to Trash again is idempotent — no duplicate TRASHED event", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await createSubmission(engagement);
  await moveContactToTrash(engagement, submission.id, founder);
  await moveContactToTrash(engagement, submission.id, founder);

  const history = await getContactHistory(engagement, submission.id);
  assert.equal(history.filter((h) => h.eventType === "TRASHED").length, 1);
});

// TEST 10: Permanent delete.
test("contact-service: permanent delete refuses a submission that isn't in Trash, and requires it once it is", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await createSubmission(engagement);

  await assert.rejects(() => permanentlyDeleteContact(engagement, submission.id, founder));

  await moveContactToTrash(engagement, submission.id, founder);
  await permanentlyDeleteContact(engagement, submission.id, founder);

  assert.equal(await engagement.contact.getById(submission.id), null);
});

test("contact-service: permanent delete records a PERMANENT_DELETE audit event that survives the row's deletion", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await createSubmission(engagement);
  await moveContactToTrash(engagement, submission.id, founder);
  await permanentlyDeleteContact(engagement, submission.id, founder);

  const history = await getContactHistory(engagement, submission.id);
  const event = history.find((h) => h.eventType === "PERMANENT_DELETE");
  assert.ok(event, "the audit event must exist even though the submission row is gone");
  assert.equal(event?.actorId, "test-founder");
});

test("contact-service: acting on a nonexistent submission id throws NotFoundError, never a silent success", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const notifications = createInMemoryNotificationRepository();
  await assert.rejects(
    () => changeContactStatus(engagement, notifications, "00000000-0000-0000-0000-000000000000", "RESOLVED", null, founder),
    NotFoundError,
  );
});
