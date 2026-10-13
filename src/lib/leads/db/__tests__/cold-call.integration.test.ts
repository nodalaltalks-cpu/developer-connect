import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Cold call against the REAL PostgreSQL adapter (test database only): findByPhone, one lead per number, ownership. */
const skip = !hasTestDatabase;

function uniqueIndianMobile(): string {
  // 9 + 9 random digits: a valid-looking Indian mobile that will not collide with seeded test data.
  return "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
}

test("integration: a cold call creates only a hidden PROSPECT (never a lead), concurrent calls share it, anyone can call it again, and only 'interested' makes it a lead", { skip }, async () => {
  const [leadPg, svc, leadSvc, errors] = await Promise.all([import("../postgres-repository.ts"), import("../../cold-call-service.ts"), import("../../cold-call-lead-service.ts"), import("../../errors.ts")]);
  const repos = leadPg.createPostgresLeadRepositories();
  const caller = { actorType: "EMPLOYEE" as const, actorId: `user_cc_${randomUUID().slice(0, 10)}` };
  const other = { actorType: "EMPLOYEE" as const, actorId: `user_cc_${randomUUID().slice(0, 10)}` };
  const phone = uniqueIndianMobile();

  assert.equal(await repos.leads.findByPhone(phone), null, "findByPhone is a read: nothing exists, nothing is created");
  assert.deepEqual(await svc.lookupColdCallNumber(repos, phone, caller), { kind: "NEW", e164: phone });

  // Two simultaneous cold calls to the same new number.
  const results = await Promise.allSettled([svc.prepareColdCall(repos, { phone }, caller), svc.prepareColdCall(repos, { phone }, caller)]);
  const done = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof svc.prepareColdCall>>> => r.status === "fulfilled");
  assert.ok(done.length >= 1, "at least one cold call succeeded");
  const prospect = (await repos.leads.findByPhone(phone))!;
  assert.ok(prospect, "the record exists");
  assert.ok(done.every((d) => d.value.leadId === prospect.id), "every successful call is on the one record");
  assert.equal(prospect.prospect, true, "a cold call is not a lead");
  assert.equal(prospect.ownerId, null);
  assert.equal(prospect.sourceType, "COLD_CALL");
  assert.equal(prospect.creationMethod, "DIALER_GENERATED");
  assert.equal(done.filter((d) => d.value.createdLead).length, 0, "no call created a lead");
  // Hidden from the lead lists.
  assert.ok(!(await repos.leads.listForQueue(500)).some((l) => l.id === prospect.id));

  // Anyone may call a prospect again, as often as they like.
  const again = await svc.prepareColdCall(repos, { phone }, other);
  assert.equal(again.leadId, prospect.id);
  assert.deepEqual(await svc.lookupColdCallNumber(repos, phone, other), { kind: "NEW", e164: phone });

  // Only "interested" with the short details makes it a lead, owned by whoever qualified it.
  const saved = await leadSvc.saveColdCallLead(repos, { leadId: prospect.id, name: "Test client", interest: "INTERESTED", qualification: { outcome: "PENDING_QUALIFICATION" }, note: "Wants a callback" }, caller);
  assert.equal(saved.saved, true);
  const lead = (await repos.leads.findByPhone(phone))!;
  assert.equal(lead.prospect, false);
  assert.equal(lead.ownerId, caller.actorId);
  // Now it is a real lead: another employee is refused and learns nothing about it.
  assert.deepEqual(await svc.lookupColdCallNumber(repos, phone, other), { kind: "NOT_YOURS", e164: phone });
  await assert.rejects(svc.prepareColdCall(repos, { phone }, other), errors.LeadStateError);
  const calls = await repos.calls.listByLead(lead.id);
  assert.ok(calls.length >= 3, "every call, from both employees, is kept on the record");
});
