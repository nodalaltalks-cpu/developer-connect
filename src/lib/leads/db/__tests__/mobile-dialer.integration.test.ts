import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The Android-SIM call path and calling batches against the REAL PostgreSQL adapter and migration 0022, on the
 * disposable test database only (skipped when TEST_DATABASE_URL is unset). The phone is SIMULATED by calling the
 * report function with call-log-shaped figures: this proves OUR schema, triggers, idempotency and SQL. It proves nothing
 * about a real Android device, SIM or call log.
 */
const skip = !hasTestDatabase;

async function modules() {
  const [service, calls, batchSvc, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../call-service.ts"),
    import("../../calling-batch-service.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, calls, batchSvc, leadPg, schema, db: client.getDb(), phone, sql: drizzle.sql };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

/** A lead owned by the given employee (the employee id is a plain test string; no Clerk user is involved). */
async function ownedLead(label: string, ownerId: string) {
  const { service, leadPg, schema, db } = await modules();
  const developerId = randomUUID();
  const slug = `test-mobile-dialer-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Mobile Dialer Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `md-${randomUUID()}`;
  const repos = leadPg.createPostgresLeadRepositories();
  const { lead } = await service.captureAssistanceLead(repos, {
    phone: await freshPhone(),
    name: `TEST ${label}`,
    email: null,
    contactPreference: "PHONE_CALL",
    developer: { id: developerId, slug, displayName: "TEST — Mobile Dialer Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return repos.leads.update(lead.id, { ownerId }, new Date());
}

const employee = () => ({ actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 12)}` });
const refusal = (re: RegExp) => (error: unknown) => re.test(`${(error as Error).message} ${((error as { cause?: Error }).cause?.message) ?? ""}`);

async function deviceCall(leadId: string, who: { actorType: "EMPLOYEE"; actorId: string }, seconds: number, batchId: string | null = null) {
  const { calls, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dialedAt = new Date(Date.now() - (seconds + 30) * 1000);
  const prepared = await calls.prepareDeviceCall(repos, leadId, who, { batchId }, dialedAt);
  const outcome = await calls.reportDeviceCall(repos, prepared.call.id, { startedAt: new Date(dialedAt.getTime() + 2000), durationSeconds: seconds, simRef: "1", callLogRef: "77", deviceRef: "TestPhone" }, who, new Date());
  return { prepared, outcome, repos };
}

test("integration: 10 s is DIALED and 11 s is CONNECTED in the real database; talk time and device fields are stored once", { skip }, async () => {
  const who = employee();
  const [a, b] = [await ownedLead("ten", who.actorId), await ownedLead("eleven", who.actorId)];
  const ten = (await deviceCall(a.id, who, 10)).outcome.call;
  const eleven = (await deviceCall(b.id, who, 11)).outcome.call;
  assert.deepEqual([ten.classification, ten.durationSeconds, ten.method], ["DIALED", 10, "ANDROID_SIM"]);
  assert.deepEqual([eleven.classification, eleven.durationSeconds], ["CONNECTED", 11]);
  assert.ok(eleven.reportedAt && eleven.startedAt);
  assert.equal(eleven.simRef, "1");
  assert.equal(eleven.callLogRef, "77");
});

test("integration: the same report delivered five times at once is applied ONCE — one raw event, one CALL_ENDED, same result", { skip }, async () => {
  const { calls, service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const who = employee();
  const lead = await ownedLead("concurrent", who.actorId);
  const dialedAt = new Date(Date.now() - 120_000);
  const { call } = await calls.prepareDeviceCall(repos, lead.id, who, {}, dialedAt);
  const report = { startedAt: new Date(dialedAt.getTime() + 1000), durationSeconds: 45, simRef: "2", callLogRef: "9" };
  const results = await Promise.all(Array.from({ length: 5 }, () => calls.reportDeviceCall(repos, call.id, report, who, new Date()).catch((e) => e)));
  const applied = results.filter((r) => !(r instanceof Error) && r.duplicate === false);
  assert.equal(applied.length, 1, "exactly one delivery is the real one");
  assert.ok(results.every((r) => r instanceof Error || r.call.classification === "CONNECTED"));
  assert.equal((await repos.calls.listEvents(call.id)).length, 1);
  assert.equal((await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "CALL_ENDED").length, 1);
});

test("integration: only the issued-to employee can report; a failed (refused) report leaves the attempt reportable", { skip }, async () => {
  const { calls, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const who = employee();
  const lead = await ownedLead("idor", who.actorId);
  const dialedAt = new Date(Date.now() - 60_000);
  const { call } = await calls.prepareDeviceCall(repos, lead.id, who, {}, dialedAt);
  await assert.rejects(calls.reportDeviceCall(repos, call.id, { startedAt: dialedAt, durationSeconds: 5 }, employee(), new Date()), /not found/i);
  await assert.rejects(calls.reportDeviceCall(repos, call.id, { startedAt: dialedAt, durationSeconds: 99_999 }, who, new Date()), /duration/i);
  const ok = await calls.reportDeviceCall(repos, call.id, { startedAt: dialedAt, durationSeconds: 5 }, who, new Date());
  assert.equal(ok.duplicate, false, "the refused report stored nothing, so the good one is still the first");
  await assert.rejects(calls.prepareDeviceCall(repos, lead.id, employee(), {}, new Date()), /not found/i, "another employee cannot even start a call on this lead");
});

test("integration: the DATABASE refuses to rewrite a reported call — classification, device fields, method, batch — and refuses deletes", { skip }, async () => {
  const { db, sql } = await modules();
  const who = employee();
  const lead = await ownedLead("triggers", who.actorId);
  const { outcome } = await deviceCall(lead.id, who, 30);
  const id = outcome.call.id;
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET classification = 'DIALED' WHERE id = ${id}`), refusal(/classification|finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET duration_seconds = 1 WHERE id = ${id}`), refusal(/finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET sim_ref = 'x' WHERE id = ${id}`), refusal(/device report|finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET started_at = now() WHERE id = ${id}`), refusal(/device report|finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET method = 'PROVIDER' WHERE id = ${id}`), refusal(/identity columns/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET staff_user_id = 'someone_else' WHERE id = ${id}`), refusal(/identity columns/));
  await assert.rejects(db.execute(sql`DELETE FROM lead_calls WHERE id = ${id}`), refusal(/append-only/));
});

test("integration: calling batch — create, queue counts and NEXT CALL from real call records; leads referenced not copied; items unique; batches cannot be deleted while referenced", { skip }, async () => {
  const { batchSvc, leadPg, schema, db, sql } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const who = employee();
  const leads = [await ownedLead("q1", who.actorId), await ownedLead("q2", who.actorId), await ownedLead("q3", who.actorId)];
  const batchId = randomUUID();
  const batch = await repos.callingBatches.create({ name: "TEST batch", createdBy: "user_founder_it", assignedTo: who.actorId, importBatchId: null, leadIds: leads.map((l) => l.id), now: new Date() });
  assert.equal(batch.itemCount, 3);
  void batchId;

  let queue = (await batchSvc.getCallingQueue(repos, who, batch.id))!;
  assert.deepEqual(queue.counts, { assigned: 3, attempted: 0, callback: 0, completed: 0, connected: 0, dialed: 0, notConnected: 0, pending: 3, returned: 0, skipped: 0 });
  assert.equal(queue.next?.progress.lead.id, leads[0].id);

  await deviceCall(leads[0].id, who, 75, batch.id);
  await deviceCall(leads[1].id, who, 4, batch.id);
  queue = (await batchSvc.getCallingQueue(repos, who, batch.id))!;
  assert.deepEqual(queue.counts, { assigned: 3, attempted: 0, callback: 0, completed: 2, connected: 1, dialed: 1, notConnected: 1, pending: 1, returned: 0, skipped: 0 });
  assert.equal(queue.next?.progress.lead.id, leads[2].id);
  assert.equal(queue.rows[0].progress.lastClassification, "CONNECTED");

  assert.equal(await batchSvc.getCallingQueue(repos, employee(), batch.id), null, "another employee's queue is not found");
  assert.equal((await batchSvc.listMyBatches(repos, who)).length, 1);

  await assert.rejects(db.insert(schema.callingBatchItems).values({ id: randomUUID(), batchId: batch.id, leadId: leads[0].id, position: 9 }), "a lead appears once per batch");
  await assert.rejects(db.execute(sql`DELETE FROM calling_batches WHERE id = ${batch.id}`), "a batch with items cannot be deleted");
  assert.equal((await repos.leads.getById(leads[0].id))?.phoneE164, leads[0].phoneE164, "the lead itself is untouched (referenced, never copied)");
});

test("integration: the SQL aggregate counts dialed = classified calls and connected = more than 10 s, with talk time only from connected calls", { skip }, async () => {
  const { leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const who = employee();
  const leads = await Promise.all([0, 1, 2, 3].map((i) => ownedLead(`agg${i}`, who.actorId)));
  for (const [i, seconds] of [0, 10, 11, 120].entries()) await deviceCall(leads[i].id, who, seconds);
  const from = new Date(Date.now() - 3_600_000);
  const to = new Date(Date.now() + 3_600_000);
  const [row] = await repos.calls.aggregate({ from, to, groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata", staffUserId: who.actorId });
  assert.equal(row.dialed, 4);
  assert.equal(row.connected, 2);
  assert.equal(row.talkSeconds, 131);
  assert.equal(row.leadsCalled, 4);
  const dialedOnly = await repos.calls.aggregate({ from, to, groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata", staffUserId: who.actorId, connected: false });
  assert.equal(dialedOnly[0].dialed, 2);
});
