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

test("integration: a cold call creates one lead, concurrent cold calls never duplicate it, and another employee is refused", { skip }, async () => {
  const [leadPg, svc, errors] = await Promise.all([import("../postgres-repository.ts"), import("../../cold-call-service.ts"), import("../../errors.ts")]);
  const repos = leadPg.createPostgresLeadRepositories();
  const caller = { actorType: "EMPLOYEE" as const, actorId: `user_cc_${randomUUID().slice(0, 10)}` };
  const other = { actorType: "EMPLOYEE" as const, actorId: `user_cc_${randomUUID().slice(0, 10)}` };
  const phone = uniqueIndianMobile();

  assert.equal(await repos.leads.findByPhone(phone), null, "findByPhone is a read: nothing exists, nothing is created");
  assert.equal(await repos.leads.findByPhone(phone), null);
  assert.deepEqual(await svc.lookupColdCallNumber(repos, phone, caller), { kind: "NEW", e164: phone });

  // Two simultaneous cold calls to the same new number.
  const results = await Promise.allSettled([svc.prepareColdCall(repos, { phone }, caller), svc.prepareColdCall(repos, { phone }, caller)]);
  const done = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof svc.prepareColdCall>>> => r.status === "fulfilled");
  assert.ok(done.length >= 1, "at least one cold call succeeded");
  const lead = (await repos.leads.findByPhone(phone))!;
  assert.ok(lead, "the lead exists");
  assert.ok(done.every((d) => d.value.leadId === lead.id), "every successful call is on the one lead");
  assert.equal(lead.ownerId, caller.actorId);
  assert.equal(lead.sourceType, "SELF_GENERATED");
  assert.equal(lead.creationMethod, "DIALER_GENERATED");
  assert.equal(done.filter((d) => d.value.createdLead).length, 1, "exactly one of them created it");

  // The creator can call it again (attached, nothing new); another employee cannot, and learns nothing about it.
  const again = await svc.prepareColdCall(repos, { phone }, caller);
  assert.equal(again.leadId, lead.id);
  assert.equal(again.createdLead, false);
  assert.deepEqual(await svc.lookupColdCallNumber(repos, phone, other), { kind: "NOT_YOURS", e164: phone });
  await assert.rejects(svc.prepareColdCall(repos, { phone }, other), errors.LeadStateError);
  const calls = await repos.calls.listByLead(lead.id);
  assert.ok(calls.length >= 2 && calls.every((c) => c.staffUserId === caller.actorId), "every attempt belongs to the caller; none was created for the other employee");
});
