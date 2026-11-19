import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Runs only against the local Firestore emulator (npm run test:firestore). */
const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore notifications: list newest-first, per-user unread counts, ownership on markRead, markAllRead", { skip }, async () => {
  const { createFirestoreNotificationRepository } = await import("../../notifications/firestore/firestore-repository.ts");
  const repo = createFirestoreNotificationRepository();
  const u = `u-${randomUUID()}`;
  const other = `u-${randomUUID()}`;
  const first = await repo.create({ userId: u, type: "PROFILE_COMPLETION", title: "First", body: "." });
  await new Promise((r) => setTimeout(r, 5));
  await repo.create({ userId: u, type: "FOUNDER_MESSAGE", title: "Second", body: ".", targetRoute: "/x" });
  await repo.create({ userId: other, type: "PROFILE_COMPLETION", title: "Other", body: "." });

  const list = await repo.listForUser(u);
  assert.deepEqual(list.map((n) => n.title), ["Second", "First"]);
  assert.equal(await repo.countUnreadForUser(u), 2);
  assert.equal(await repo.countUnreadForUser(other), 1);
  assert.equal(await repo.markRead(first.id, other), null);
  const read = await repo.markRead(first.id, u);
  assert.equal(read?.read, true);
  assert.ok(read?.readAt);
  assert.equal(await repo.hasUnreadOfType(u, "PROFILE_COMPLETION"), false);
  assert.equal(await repo.hasUnreadOfType(u, "FOUNDER_MESSAGE"), true);
  assert.equal((await repo.findUnreadByTarget(u, "/x"))?.title, "Second");
  assert.equal(await repo.markAllRead(u), 1);
  assert.equal(await repo.countUnreadForUser(u), 0);
  const byType = await repo.listByType("FOUNDER_MESSAGE", 50, { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) });
  assert.ok(byType.some((n) => n.userId === u));
});

test("firestore profiles: createIfMissing is idempotent; updateFields shallow-merges", { skip }, async () => {
  const { createFirestoreProfileRepository } = await import("../../profile/firestore/firestore-repository.ts");
  const repo = createFirestoreProfileRepository();
  const id = `p-${randomUUID()}`;
  assert.equal(await repo.getByUserId(id), null);
  const a = await repo.createIfMissing(id);
  const b = await repo.createIfMissing(id);
  assert.equal(a.createdAt.getTime(), b.createdAt.getTime());
  await repo.updateFields(id, { city: "Mumbai" });
  const merged = await repo.updateFields(id, { budget: 5 });
  assert.deepEqual(merged.data, { city: "Mumbai", budget: 5 });
  const many = await repo.getManyByUserIds([id, "missing"]);
  assert.equal(many.length, 1);
});
