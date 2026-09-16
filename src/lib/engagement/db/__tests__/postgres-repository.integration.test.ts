import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";

/**
 * Real-Postgres coverage for the new inaccuracy_reports/contact_submissions/
 * newsletter_subscribers tables (the schema migration this task's Report/
 * Contact/Newsletter features required — see the migration under
 * src/lib/developer-connect/db/migrations/). Same convention as
 * developer-connect's own postgres-repository.integration.test.ts: leaves
 * "TEST —"-ish rows behind, skipped unless TEST_DATABASE_URL is set.
 */

test(
  "postgres engagement: an inaccuracy report is created against a real developer and status transitions persist",
  { skip: !hasTestDatabase },
  async () => {
    const { createPostgresRepositories } = await import("../../../developer-connect/db/postgres-repository.ts");
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const devRepos = createPostgresRepositories();
    const engagement = createEngagementRepositories();

    const developer = await devRepos.developers.create({
      legalName: `TEST — Engagement Report Co ${randomUUID()}`,
      displayName: `TEST — Engagement Report Co ${randomUUID()}`,
      slug: `test-engagement-report-${randomUUID()}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });

    const report = await engagement.reports.create({
      developerId: developer.id,
      category: "OFFICIAL_WEBSITE",
      details: "Link is broken",
      reporterEmail: "visitor@example.com",
    });
    assert.equal(report.status, "NEW");

    const list = await engagement.reports.list();
    assert.ok(list.some((r) => r.id === report.id));

    const updated = await engagement.reports.updateStatus(report.id, "RESOLVED");
    assert.equal(updated?.status, "RESOLVED");
  },
);

test(
  "postgres engagement: contact submissions persist and status updates work",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const engagement = createEngagementRepositories();

    const submission = await engagement.contact.create({
      name: "TEST — Contact Visitor",
      email: `test-contact-${randomUUID()}@example.com`,
      reason: "GENERAL_QUESTION",
      message: "Hello",
    });
    assert.equal(submission.status, "OPEN");
    assert.equal(submission.deletedAt, null);

    const updated = await engagement.contact.updateStatus(submission.id, "RESOLVED");
    assert.equal(updated?.status, "RESOLVED");
  },
);

test(
  "postgres engagement: contact status history is append-only real data — every field change persists exactly as recorded",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const { changeContactStatus } = await import("../../contact-service.ts");
    const { createPostgresNotificationRepository } = await import("../../../notifications/db/postgres-repository.ts");
    const engagement = createEngagementRepositories();
    const notifications = createPostgresNotificationRepository();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder-engagement" };

    const submission = await engagement.contact.create({
      name: "TEST — History Visitor",
      email: `test-history-${randomUUID()}@example.com`,
      reason: "OTHER",
      message: "Testing",
    });

    await changeContactStatus(engagement, notifications, submission.id, "IN_REVIEW", null, founder);
    await changeContactStatus(engagement, notifications, submission.id, "ON_HOLD", "Waiting for info", founder);
    // Idempotent re-selection: must NOT add a second history row.
    await changeContactStatus(engagement, notifications, submission.id, "ON_HOLD", "Waiting for info", founder);
    await changeContactStatus(engagement, notifications, submission.id, "RESOLVED", null, founder);

    const history = await engagement.contactHistory.listBySubmission(submission.id);
    assert.equal(history.length, 3, "exactly 3 real transitions, the duplicate ON_HOLD selection must not add a 4th");
    // Newest first.
    assert.equal(history[0].newStatus, "RESOLVED");
    assert.equal(history[1].newStatus, "ON_HOLD");
    assert.equal(history[1].note, "Waiting for info");
    assert.equal(history[2].newStatus, "IN_REVIEW");
    assert.equal(history[2].previousStatus, "OPEN");
    for (const entry of history) {
      assert.equal(entry.actorType, "FOUNDER");
      assert.equal(entry.actorId, "test-founder-engagement");
      assert.ok(entry.createdAt instanceof Date);
    }

    const finalSubmission = await engagement.contact.getById(submission.id);
    assert.equal(finalSubmission?.status, "RESOLVED", "the database status must match what history says happened last");
  },
);

test(
  "postgres engagement: soft-delete (Trash) removes a submission from the active list and listTrash, then restore reverses it, both leaving a real history event",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const { moveContactToTrash, restoreContactFromTrash } = await import("../../contact-service.ts");
    const engagement = createEngagementRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder-trash" };

    const submission = await engagement.contact.create({
      name: "TEST — Trash Visitor",
      email: `test-trash-${randomUUID()}@example.com`,
      reason: "OTHER",
      message: "Trash me",
    });

    const trashed = await moveContactToTrash(engagement, submission.id, founder);
    assert.ok(trashed.deletedAt instanceof Date);
    assert.equal(trashed.deletedBy, "test-founder-trash");

    const activeList = await engagement.contact.list(500);
    assert.ok(!activeList.some((s) => s.id === submission.id), "a trashed submission must disappear from the active list");

    const trashList = await engagement.contact.listTrash(500);
    assert.ok(trashList.some((s) => s.id === submission.id), "a trashed submission must appear in Trash");

    const restored = await restoreContactFromTrash(engagement, submission.id, founder);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.deletedBy, null);

    const activeAfterRestore = await engagement.contact.list(500);
    assert.ok(activeAfterRestore.some((s) => s.id === submission.id), "a restored submission must return to the active list");

    const history = await engagement.contactHistory.listBySubmission(submission.id);
    const eventTypes = history.map((h) => h.eventType);
    assert.ok(eventTypes.includes("TRASHED"));
    assert.ok(eventTypes.includes("RESTORED"));
  },
);

test(
  "postgres engagement: permanent delete requires the submission to already be in Trash, actually removes the row, and records an audit event that survives the deletion",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const { moveContactToTrash, permanentlyDeleteContact } = await import("../../contact-service.ts");
    const engagement = createEngagementRepositories();
    const founder = { actorType: "FOUNDER" as const, actorId: "test-founder-permadelete" };

    const submission = await engagement.contact.create({
      name: "TEST — Permanent Delete Visitor",
      email: `test-permadelete-${randomUUID()}@example.com`,
      reason: "OTHER",
      message: "Delete me for good",
    });

    // Must refuse to permanently delete a submission that was never trashed.
    await assert.rejects(() => permanentlyDeleteContact(engagement, submission.id, founder));

    await moveContactToTrash(engagement, submission.id, founder);
    await permanentlyDeleteContact(engagement, submission.id, founder);

    const gone = await engagement.contact.getById(submission.id);
    assert.equal(gone, null, "the row itself must actually be gone after permanent delete");

    // The audit event must survive even though the row it describes no
    // longer exists — this is exactly why contact_status_history's
    // contactSubmissionId is not a foreign key (see schema.ts).
    const history = await engagement.contactHistory.listBySubmission(submission.id);
    const permanentDeleteEvent = history.find((h) => h.eventType === "PERMANENT_DELETE");
    assert.ok(permanentDeleteEvent, "a PERMANENT_DELETE audit event must exist after the row is gone");
    assert.equal(permanentDeleteEvent?.actorId, "test-founder-permadelete");
  },
);

test(
  "postgres engagement: newsletter subscribe is a real upsert by email at the database level — no duplicate row on a repeat signup",
  { skip: !hasTestDatabase },
  async () => {
    const { createEngagementRepositories } = await import("../postgres-repository.ts");
    const engagement = createEngagementRepositories();
    const email = `test-newsletter-${randomUUID()}@example.com`;

    const first = await engagement.newsletter.subscribe({ email, source: "footer" });
    assert.equal(first.alreadySubscribed, false);

    const second = await engagement.newsletter.subscribe({ email, source: "homepage" });
    assert.equal(second.alreadySubscribed, true);
    assert.equal(second.subscriber.id, first.subscriber.id);

    const all = await engagement.newsletter.list(1000);
    const matches = all.filter((s) => s.email === email);
    assert.equal(matches.length, 1, "the database's unique index on email must prevent a duplicate row");
  },
);
