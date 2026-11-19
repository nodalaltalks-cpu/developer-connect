import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

const base = (over: Record<string, unknown> = {}) => ({
  userId: `user_${randomUUID()}`,
  displayName: "Test Person",
  email: `${randomUUID()}@example.com`,
  phone: "+919876543210",
  role: "EMPLOYEE" as const,
  createdBy: "founder",
  now: new Date(),
  ...over,
});

test("firestore staff: unique employee numbers under concurrency, unique email/sign-in, events with the change", { skip }, async () => {
  const { createFirestoreStaffRepository } = await import("../../staff/firestore/firestore-repository.ts");
  const repo = createFirestoreStaffRepository();

  const created = await Promise.all(Array.from({ length: 6 }, () => repo.create(base())));
  const ids = created.map((m) => m.employeeId);
  assert.equal(new Set(ids).size, 6, "no employee number may repeat");
  assert.ok(ids.every((id) => /^DC[1-9][0-9]*$/.test(id)));

  const first = created[0];
  await assert.rejects(() => repo.create(base({ email: first.email })), /already on the team/);
  await assert.rejects(() => repo.create(base({ userId: first.userId })), /already on the team/);

  const withEvent = await repo.create(base(), [{ eventType: "EMPLOYEE_INVITED", actorId: "founder", payload: { a: 1 } }]);
  assert.equal((await repo.listEvents(withEvent.id, 10)).length, 1);
  assert.equal((await repo.getByUserId(withEvent.userId))?.id, withEvent.id);
  assert.equal((await repo.getByEmployeeId(withEvent.employeeId))?.id, withEvent.id);

  // Exiting frees the email for a new record; the exited record is kept.
  const exitedAt = new Date();
  await repo.update(first.id, { status: "EXITED", exitedAt, exitedBy: "founder", exitReason: "RESIGNED" }, exitedAt);
  const reused = await repo.create(base({ email: first.email }));
  assert.notEqual(reused.id, first.id);
  assert.equal((await repo.getById(first.id))?.active, false);

  await assert.rejects(() => repo.update(randomUUID(), { displayName: "x" }, new Date()), /not found/i);
  assert.ok((await repo.list()).length >= 7);
});

test("firestore staff: invite -> link identity only when approved and unlinked", { skip }, async () => {
  const { createFirestoreStaffRepository } = await import("../../staff/firestore/firestore-repository.ts");
  const repo = createFirestoreStaffRepository();
  const now = new Date();
  const email = `${randomUUID()}@example.com`;
  const invited = await repo.create(base({ userId: `invited:${randomUUID()}`, email, status: "INVITED", approvedAt: null, now }));
  assert.equal(invited.status, "INVITED");
  assert.equal((await repo.findUnlinkedByEmail(email.toUpperCase()))?.id, invited.id);

  // Not approved yet: cannot link.
  assert.equal(await repo.linkIdentity(invited.id, `user_${randomUUID()}`, now), null);

  await repo.update(invited.id, { approvedAt: now, approvedBy: "founder" }, now);
  const realUser = `user_${randomUUID()}`;
  const linked = await repo.linkIdentity(invited.id, realUser, now, [{ eventType: "EMPLOYEE_ACTIVATED", actorId: realUser }]);
  assert.equal(linked?.status, "ACTIVE");
  assert.equal(linked?.userId, realUser);
  assert.equal(await repo.linkIdentity(invited.id, `user_${randomUUID()}`, now), null, "already linked");
  assert.equal((await repo.getByUserId(realUser))?.id, invited.id);
});
