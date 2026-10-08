import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The internal dialer and call analytics against the REAL PostgreSQL adapter and migration 0021, on the disposable test
 * database only (skipped when TEST_DATABASE_URL is unset). The telephony provider is a SYNTHETIC test double: this file
 * proves OUR schema, triggers, idempotency and SQL — it proves nothing about a real telephony vendor.
 */
const skip = !hasTestDatabase;

const HOUR = 3_600_000;

async function modules() {
  const [service, calls, importSvc, analytics, buckets, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../call-service.ts"),
    import("../../lead-import-service.ts"),
    import("../../call-analytics.ts"),
    import("../../call-buckets.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, calls, importSvc, analytics, buckets, leadPg, schema, db: client.getDb(), phone, sql: drizzle.sql, eq: drizzle.eq };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

async function newLead(label: string, gclid?: string) {
  const { service, leadPg, schema, db } = await modules();
  const developerId = randomUUID();
  const slug = `test-call-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Call Integration Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `call-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name: `TEST ${label}`,
    email: null,
    contactPreference: "PHONE_CALL",
    developer: { id: developerId, slug, displayName: "TEST — Call Integration Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}`, ...(gclid ? { gclid } : {}) },
  });
  return lead;
}

let providerCounter = 0;
const provider = () => {
  const id = randomUUID().slice(0, 8);
  return {
    name: `test-double-${id}`,
    configured: true,
    async initiateCall() {
      providerCounter += 1;
      return { providerCallId: `pc-${id}-${providerCounter}` };
    },
    parseWebhook: () => [],
  };
};

/** The database's own refusal message (the driver wraps it in `cause`). */
const refusal = (re: RegExp) => (error: unknown) => re.test(`${(error as Error).message} ${((error as { cause?: Error }).cause?.message) ?? ""}`);

const founderOf = (id: string) => ({ actorType: "FOUNDER" as const, actorId: id });

test("integration: place and drive a call to completion — durations from the provider's events; a redelivered event is stored and applied ONCE, even concurrently", { skip }, async () => {
  const { calls, service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("lifecycle");
  const who = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const p = provider();
  const call = await calls.placeCall(repos, p, lead.id, who);
  assert.equal(call.status, "INITIATED");
  assert.ok(call.providerCallId);
  assert.equal(call.phoneLast4?.length, 4);

  const t = Date.now();
  const mk = (status: "RINGING" | "CONNECTED" | "COMPLETED", at: number, extra = {}) => ({ provider: p.name, providerEventId: randomUUID(), providerCallId: call.providerCallId!, eventType: status.toLowerCase(), status, occurredAt: new Date(at), payload: { synthetic: true }, ...extra });
  await calls.ingestProviderEvent(repos, mk("RINGING", t));
  const connected = mk("CONNECTED", t + 4000);
  const done = mk("COMPLETED", t + 94_000, { durationSeconds: 90 });
  const results = await Promise.all([connected, connected, connected, connected, connected].map((e) => calls.ingestProviderEvent(repos, e)));
  assert.equal(results.filter((r) => r.applied).length, 1, "five deliveries of one event: applied once");
  await Promise.all([done, done, done].map((e) => calls.ingestProviderEvent(repos, e)));

  const stored = (await repos.calls.getById(call.id))!;
  assert.equal(stored.status, "COMPLETED");
  assert.equal(stored.durationSeconds, 90);
  assert.equal(stored.answeredAt?.getTime(), t + 4000);
  assert.equal((await repos.calls.listEvents(call.id)).length, 3, "three distinct raw events kept as evidence");
  const events = (await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "CALL_ENDED");
  assert.equal(events.length, 1, "one real call is one CALL_ENDED");

  await calls.setCallDisposition(repos, call.id, "INTERESTED", who);
  await assert.rejects(calls.setCallDisposition(repos, call.id, "NOT_INTERESTED", who), /already has an outcome/);
});

test("integration: the DATABASE refuses to rewrite history — a finished call, a provider id, a disposition, raw events — and refuses deletes", { skip }, async () => {
  const { calls, leadPg, db, sql, schema } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("triggers");
  const who = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const p = provider();
  const call = await calls.placeCall(repos, p, lead.id, who);
  const t = Date.now();
  const ev = (status: "CONNECTED" | "COMPLETED", at: number, extra = {}) => ({ provider: p.name, providerEventId: randomUUID(), providerCallId: call.providerCallId!, eventType: status.toLowerCase(), status, occurredAt: new Date(at), payload: {}, ...extra });
  await calls.ingestProviderEvent(repos, ev("CONNECTED", t));
  await calls.ingestProviderEvent(repos, ev("COMPLETED", t + 60_000, { durationSeconds: 60 }));
  await calls.setCallDisposition(repos, call.id, "FOLLOW_UP_REQUIRED", who);

  // Bypass the application entirely: straight SQL must be refused by the database itself.
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET duration_seconds = 9999 WHERE id = ${call.id}`), refusal(/finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET status = 'NO_ANSWER' WHERE id = ${call.id}`), refusal(/finished call/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET disposition = 'NOT_INTERESTED' WHERE id = ${call.id}`), refusal(/disposition cannot be changed/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET staff_user_id = 'someone_else' WHERE id = ${call.id}`), refusal(/identity columns/));
  await assert.rejects(db.execute(sql`UPDATE lead_calls SET provider_call_id = 'other' WHERE id = ${call.id}`), refusal(/provider_call_id/));
  await assert.rejects(db.execute(sql`DELETE FROM lead_calls WHERE id = ${call.id}`), refusal(/append-only/));
  const [raw] = await repos.calls.listEvents(call.id);
  await assert.rejects(db.execute(sql`UPDATE lead_call_events SET status = 'FAILED' WHERE id = ${raw.id}`), refusal(/append-only/));
  await assert.rejects(db.execute(sql`DELETE FROM lead_call_events WHERE call_id = ${call.id}`), refusal(/append-only/));
  // The unique indexes: one provider call id per provider; one provider event id per provider.
  await assert.rejects(db.insert(schema.leadCalls).values({ id: randomUUID(), leadId: lead.id, staffUserId: who.actorId, provider: p.name, providerCallId: call.providerCallId, initiatedAt: new Date() }));
  await assert.rejects(db.insert(schema.leadCallEvents).values({ id: randomUUID(), callId: call.id, provider: p.name, providerEventId: raw.providerEventId, eventType: "x", occurredAt: new Date() }));
  assert.equal((await repos.calls.getById(call.id))?.durationSeconds, 60, "nothing changed");
});

test("integration: the SQL aggregation agrees with the in-memory reference for EVERY grouping — hour of day, hour, day, week, month, quarter, year, employee — across zone and period boundaries", { skip }, async () => {
  const { calls, leadPg, buckets, schema, db, eq } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const leadA = await newLead("agg A");
  const leadB = await newLead("agg B");
  const one = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const two = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const p = provider();

  // Instants chosen to straddle IST midnight, week (Monday), month, quarter and year boundaries.
  const stamps = [
    "2031-01-05T18:29:00Z", // 23:59 IST Sun 5 Jan
    "2031-01-05T18:31:00Z", // 00:01 IST Mon 6 Jan  (new day, new ISO week)
    "2031-03-31T18:35:00Z", // 00:05 IST 1 Apr (new quarter)
    "2031-06-30T20:00:00Z", // 01:30 IST 1 Jul
    "2031-12-31T18:45:00Z", // 00:15 IST 1 Jan 2032 (new year)
    "2031-02-14T05:15:00Z",
    "2031-02-14T05:45:00Z",
  ];
  const created: Array<{ id: string; at: Date; connected: boolean; seconds: number; staff: string; lead: string }> = [];
  for (const [i, iso] of stamps.entries()) {
    const at = new Date(iso);
    const who = i % 2 === 0 ? one : two;
    const lead = i % 3 === 0 ? leadA : leadB;
    const call = await calls.placeCall(repos, p, lead.id, who, at);
    const connected = i % 2 === 0;
    const base = (status: "RINGING" | "CONNECTED" | "COMPLETED" | "NO_ANSWER", offset: number, extra = {}) => ({ provider: p.name, providerEventId: randomUUID(), providerCallId: call.providerCallId!, eventType: status, status, occurredAt: new Date(at.getTime() + offset), payload: {}, ...extra });
    if (connected) {
      await calls.ingestProviderEvent(repos, base("CONNECTED", 3000), at);
      await calls.ingestProviderEvent(repos, base("COMPLETED", 3000 + (60 + i) * 1000, { durationSeconds: 60 + i }), at);
    } else await calls.ingestProviderEvent(repos, base("NO_ANSWER", 20_000), at);
    created.push({ id: call.id, at, connected, seconds: 60 + i, staff: who.actorId, lead: lead.id });
  }

  const from = new Date("2030-12-01T00:00:00Z");
  const to = new Date("2032-02-01T00:00:00Z");
  const staffFilter = (id: string) => ({ staffUserId: id });
  for (const who of [one, two]) {
    for (const groupBy of ["HOUR_OF_DAY", "HOUR", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR", "EMPLOYEE"] as const) {
      const sqlRows = await repos.calls.aggregate({ from, to, groupBy, timeZone: "Asia/Kolkata", ...staffFilter(who.actorId) });
      // The reference: the same rows bucketed by the pure helper.
      const mine = created.filter((c) => c.staff === who.actorId);
      const expected = new Map<string, { dialed: number; connected: number; talk: number; leads: Set<string> }>();
      for (const c of mine) {
        const key = groupBy === "EMPLOYEE" ? c.staff : buckets.bucketKey(c.at, groupBy, "Asia/Kolkata");
        const row = expected.get(key) ?? { dialed: 0, connected: 0, talk: 0, leads: new Set<string>() };
        row.dialed += 1;
        if (c.connected) {
          row.connected += 1;
          row.talk += c.seconds;
        }
        row.leads.add(c.lead);
        expected.set(key, row);
      }
      assert.deepEqual(
        sqlRows.map((r) => [r.key, r.dialed, r.connected, r.talkSeconds, r.leadsCalled]),
        [...expected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, r]) => [k, r.dialed, r.connected, r.talk, r.leads.size]),
        `${groupBy} for ${who.actorId}`,
      );
    }
  }

  // The filters narrow the same query in SQL.
  const connectedOnly = await repos.calls.aggregate({ from, to, groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata", connected: true, staffUserId: one.actorId });
  assert.equal(connectedOnly[0]?.dialed, created.filter((c) => c.staff === one.actorId && c.connected).length);
  const unconnected = await repos.calls.aggregate({ from, to, groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata", statuses: ["NO_ANSWER"], staffUserId: two.actorId });
  assert.equal(unconnected[0]?.noAnswer, created.filter((c) => c.staff === two.actorId).length);
  // A zone name that is not a plain IANA name never reaches SQL.
  await assert.rejects(repos.calls.aggregate({ from, to, groupBy: "DAY", timeZone: "UTC'; DROP TABLE leads;--" }), /Unsafe time zone/);
  void schema; void db; void eq;
});

test("integration: source filtering and separation — a COLD_CALL lead's calls are counted apart from a DIGITAL lead's, and calling never changes where a lead came from", { skip }, async () => {
  const { calls, leadPg, db, schema, eq } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const digital = await newLead("digital", "gclid-abc");
  // A genuine cold-call lead: the source is fixed when the lead is created (the database refuses any later change).
  const { createSelfGeneratedLead } = await import("../../lead-import-service.ts");
  const madeSelf = await createSelfGeneratedLead(repos, { phone: await freshPhone(), name: "TEST self", creationMethod: "COLD_CALLING" }, { actorType: "EMPLOYEE", actorId: `user_it_${randomUUID().slice(0, 12)}` });
  assert.ok(madeSelf.created);
  const self = madeSelf.lead;
  void schema; void db; void eq;
  assert.equal(digital.sourceType, "DIGITAL");
  assert.equal(digital.sourceDetail, "GOOGLE", "classified from the first touch at capture");
  assert.equal(digital.creationMethod, "WEBSITE_GATE");

  const who = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const p = provider();
  const at = new Date("2031-05-05T05:00:00Z");
  // A call counts once it has reached the other end (is classified), so each one is finished with a synthetic NO_ANSWER.
  const placeAndFinish = async (leadId: string, when: Date) => {
    const call = await calls.placeCall(repos, p, leadId, who, when);
    await calls.ingestProviderEvent(repos, { provider: p.name, providerEventId: randomUUID(), providerCallId: call.providerCallId!, eventType: "no_answer", status: "NO_ANSWER", occurredAt: new Date(when.getTime() + 20_000), payload: { synthetic: true } }, when);
  };
  await placeAndFinish(digital.id, at);
  await placeAndFinish(self.id, new Date(at.getTime() + HOUR));
  await placeAndFinish(self.id, new Date(at.getTime() + 2 * HOUR));
  const q = { from: new Date("2031-05-01T00:00:00Z"), to: new Date("2031-06-01T00:00:00Z"), groupBy: "EMPLOYEE" as const, timeZone: "Asia/Kolkata", staffUserId: who.actorId };
  assert.equal((await repos.calls.aggregate({ ...q, sourceType: "DIGITAL" }))[0].dialed, 1);
  assert.equal((await repos.calls.aggregate({ ...q, sourceType: "COLD_CALL" }))[0].dialed, 2);
  assert.equal((await repos.calls.aggregate(q))[0].dialed, 3);
  const feed = await repos.calls.listRecent({ staffUserId: who.actorId, limit: 10 });
  assert.deepEqual(feed.map((r) => r.lead.sourceType), ["COLD_CALL", "COLD_CALL", "DIGITAL"], "newest first, each with its lead's source");
  assert.equal((await repos.leads.getById(self.id))?.sourceType, "COLD_CALL", "calling did not change the source");
});

test("integration: a CSV import creates COLD_CALL leads tied to the batch (who, when, file, campaign), skips duplicates and bad rows, and creates no consent", { skip }, async () => {
  const { importSvc, leadPg, service } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const founder = founderOf(`user_it_${randomUUID().slice(0, 12)}`);
  const a = await freshPhone();
  const b = await freshPhone();
  const existing = await newLead("already there");
  const csv = `Name,Mobile,Email\nTEST Import A,${a},a@example.com\nTEST Import B,${b},\nDup In File,${a},\nBad,123,\nTEST Existing,${existing.phoneE164},`;
  const result = await importSvc.importLeadsFromCsv(repos, csv, { name: `TEST batch ${randomUUID().slice(0, 6)}`, originalFilename: "test.csv", campaign: "TEST campaign" }, founder);
  assert.deepEqual([result.created, result.duplicates.length, result.rejected.length], [2, 2, 1]);
  assert.deepEqual([result.batch.rowCount, result.batch.createdCount, result.batch.duplicateCount, result.batch.rejectedCount], [5, 2, 2, 1]);
  assert.equal(result.batch.importedBy, founder.actorId);

  const created = await Promise.all([a, b].map(async (phone) => {
    const rows = (await repos.leads.list({ view: "all", limit: 5000, offset: 0, now: new Date(), endOfToday: new Date(Date.now() + 86_400_000) })).leads;
    return rows.find((l) => l.phoneE164 === phone)!;
  }));
  for (const lead of created) {
    assert.equal(lead.sourceType, "COLD_CALL");
    assert.equal(lead.creationMethod, "CSV_IMPORT");
    assert.equal(lead.importBatchId, result.batch.id);
    assert.equal(lead.createdBy, founder.actorId);
    assert.equal((await repos.consents.listByLead(lead.id)).length, 0);
    const [event] = (await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "LEAD_CREATED");
    assert.deepEqual(event.payload, { via: "IMPORT", batchId: result.batch.id });
  }
  assert.equal((await repos.leads.getById(existing.id))?.sourceType, "DIGITAL", "an existing lead is never modified");
  assert.equal((await repos.importBatches.getById(result.batch.id))?.createdCount, 2);
});

test("integration: the analytics support queries — current-lead outcomes, revenue per currency, follow-up stats, returned counts — work in SQL", { skip }, async () => {
  const { service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const owner = `user_it_${randomUUID().slice(0, 12)}`;
  const q = await newLead("outcomes qualified");
  const booked = await newLead("outcomes booked");
  await repos.leads.update(q.id, { ownerId: owner, status: "QUALIFIED" }, new Date());
  await repos.leads.update(booked.id, { ownerId: owner, status: "BOOKED" }, new Date());
  await repos.bookings.create({ leadId: booked.id, developerId: null, projectName: "TEST Tower", currency: "INR", bookingValue: 12_500_000, commissionExpected: 1, bookedAt: new Date(), createdBy: "x", now: new Date() });
  await repos.bookings.create({ leadId: booked.id, developerId: null, projectName: "TEST Tower 2", currency: "AED", bookingValue: 800_000, commissionExpected: 1, bookedAt: new Date(), createdBy: "x", now: new Date() });

  const summary = (await repos.leads.ownerSummary())[owner];
  assert.deepEqual(summary, { qualified: 1, siteVisit: 0, booked: 1 });
  const revenue = (await repos.bookings.revenueByOwner()).filter((r) => r.ownerId === owner).sort((a, b) => a.currency.localeCompare(b.currency));
  assert.deepEqual(revenue, [{ ownerId: owner, currency: "AED", total: 800_000, count: 1 }, { ownerId: owner, currency: "INR", total: 12_500_000, count: 1 }], "never summed across currencies");

  const from = new Date(Date.now() - 3 * 3_600_000);
  const to = new Date(Date.now() + 3_600_000);
  await repos.events.append({ leadId: q.id, eventType: "RETURNED_TO_FOUNDER", actorType: "EMPLOYEE", actorId: owner, developerId: null, fromStatus: null, toStatus: null, payload: { reason: "OTHER" }, createdAt: new Date() });
  assert.equal((await repos.events.countByTypeAndActor("RETURNED_TO_FOUNDER", from, to))[owner], 1);

  await repos.followUps.create({ leadId: q.id, type: "CALL_BACK", scheduledAt: new Date(Date.now() - HOUR), ownerId: owner, note: null, createdBy: owner, now: new Date(Date.now() - 2 * HOUR) });
  const stats = (await repos.followUps.statsByStaff(from, to, new Date()))[owner];
  assert.deepEqual([stats.created, stats.completed, stats.missedNow], [1, 0, 1]);
  void service;
});

test("integration: existing leads kept the column defaults — DIGITAL / WEBSITE_GATE — and nothing in the migration rewrote them", { skip }, async () => {
  const { db, sql } = await modules();
  const bad = await db.execute(sql`SELECT id FROM leads WHERE import_batch_id IS NULL AND created_by IS NULL AND creation_method = 'WEBSITE_GATE' AND source_type <> 'DIGITAL'`);
  assert.equal(bad.rows.length, 0, "no website-gate lead is mislabelled");
  const total = await db.execute(sql`SELECT count(*)::int AS n FROM leads WHERE creation_method = 'WEBSITE_GATE' AND source_type = 'DIGITAL'`);
  assert.ok(Number((total.rows[0] as { n: number }).n) > 0);
});
