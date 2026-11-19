import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore engagement: reports, contact lifecycle with trash, history, newsletter upsert", { skip }, async () => {
  const { createFirestoreEngagementRepositories } = await import("../../engagement/firestore/firestore-repository.ts");
  const e = createFirestoreEngagementRepositories();
  const tag = randomUUID().slice(0, 8);

  const report = await e.reports.create({ developerId: randomUUID(), category: "OTHER", details: `d-${tag}`, reporterEmail: "" } as never);
  assert.equal(report.reporterEmail, null);
  assert.equal((await e.reports.updateStatus(report.id, "RESOLVED"))?.status, "RESOLVED");
  assert.equal(await e.reports.updateStatus(randomUUID(), "RESOLVED"), null);
  assert.ok((await e.reports.list(50, { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) })).some((r) => r.id === report.id));

  const c = await e.contact.create({ name: "A", email: `${tag}@x.com`, reason: "GENERAL_QUESTION", message: "hi", userId: null } as never);
  assert.equal(c.status, "OPEN");
  assert.ok((await e.contact.list()).some((x) => x.id === c.id));
  assert.equal(await e.contact.permanentDelete(c.id), false, "cannot destroy an active submission");

  assert.equal((await e.contact.updateStatus(c.id, "IN_REVIEW"))?.status, "IN_REVIEW");
  assert.ok(await e.contact.softDelete(c.id, "founder"));
  assert.equal(await e.contact.softDelete(c.id, "founder"), null, "already in trash");
  assert.equal((await e.contact.list()).some((x) => x.id === c.id), false);
  assert.ok((await e.contact.listTrash()).some((x) => x.id === c.id));
  assert.ok((await e.contact.restore(c.id)) !== null);
  assert.ok((await e.contact.list()).some((x) => x.id === c.id));

  await e.contactHistory.append({ contactSubmissionId: c.id, eventType: "STATUS_CHANGE", previousStatus: "OPEN", newStatus: "IN_REVIEW", actorType: "FOUNDER", actorId: "f" } as never);
  await new Promise((r) => setTimeout(r, 5));
  await e.contactHistory.append({ contactSubmissionId: c.id, eventType: "TRASHED", actorType: "FOUNDER", actorId: "f" } as never);
  assert.deepEqual((await e.contactHistory.listBySubmission(c.id)).map((h) => h.eventType), ["TRASHED", "STATUS_CHANGE"]);

  await e.contact.softDelete(c.id, "founder");
  assert.equal(await e.contact.permanentDelete(c.id), true);
  assert.equal(await e.contact.getById(c.id), null);

  const email = `news-${tag}@example.com`;
  const before = await e.newsletter.countActive();
  const first = await e.newsletter.subscribe({ email, source: "footer", userId: null });
  assert.equal(first.alreadySubscribed, false);
  const again = await e.newsletter.subscribe({ email, source: "home", userId: null });
  assert.equal(again.alreadySubscribed, true);
  assert.equal(again.subscriber.id, first.subscriber.id);
  assert.equal(await e.newsletter.countActive(), before + 1);
  assert.ok((await e.newsletter.list(50)).some((s) => s.email === email));

  await assert.rejects(() =>
    e.runInTransaction(async (tx) => {
      await tx.reports.create({ developerId: randomUUID(), category: "OTHER", details: `rollback-${tag}` } as never);
      throw new Error("boom");
    }),
  /boom/);
  assert.equal((await e.reports.list(500)).some((r) => r.details === `rollback-${tag}`), false);
});
