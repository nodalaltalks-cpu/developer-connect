import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Stage 4 against the REAL PostgreSQL adapter and migration 0016, on the
 * disposable test database only (skipped when TEST_DATABASE_URL is unset).
 * The point of this file: the SQL list/count rules agree with the pure
 * reference rules in lead-views.ts on the same rows — the in-memory unit
 * tests prove the rules, this proves the database implements the same ones.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };
const HOUR = 3_600_000;

async function modules() {
  const [service, pg, views, reads, phone, schema, client, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../postgres-repository.ts"),
    import("../../lead-views.ts"),
    import("../../lead-reads.ts"),
    import("../../phone.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  return { service, pg, views, reads, phone, schema, db: client.getDb(), sql: drizzle.sql };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

async function testDeveloper() {
  const { db, schema } = await modules();
  const id = randomUUID();
  const slug = `test-crm-integration-${randomUUID()}`;
  const displayName = "TEST — CRM Integration Co";
  await db.insert(schema.developers).values({ id, displayName, slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  return { id, slug, displayName };
}

async function capture(developer: { id: string; slug: string; displayName: string }, name: string) {
  const { service, pg } = await modules();
  const sessionId = `crm-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(pg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name,
    email: null,
    contactPreference: "WHATSAPP",
    developer,
    website: { url: "https://example.test/", domain: "example.test", verifiedAt: new Date("2026-09-01T00:00:00.000Z") },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: "/developers/x", utmSource: "google" },
  });
  return lead;
}

test("postgres: temperature persists, is independent of status, and its history survives", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const lead = await capture(await testDeveloper(), "Temperature Buyer");
  assert.equal(lead.temperature, null);

  await service.setTemperature(repos, lead.id, "HOT", FOUNDER);
  await service.changeLeadStatus(repos, lead.id, "QUALIFIED", FOUNDER);
  await service.setTemperature(repos, lead.id, "WARM", FOUNDER);

  const reloaded = await repos.leads.getById(lead.id);
  assert.equal(reloaded?.temperature, "WARM");
  assert.equal(reloaded?.status, "QUALIFIED");

  const changes = (await repos.events.listByLead(lead.id)).filter((event) => event.eventType === "TEMPERATURE_CHANGED");
  assert.deepEqual(
    changes.map((event) => [event.payload.from, event.payload.to]),
    [
      [null, "HOT"],
      ["HOT", "WARM"],
    ],
  );
});

test("postgres: the new event types, follow-up completion and owner changes are accepted and ordered", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const lead = await capture(await testDeveloper(), "Events Buyer");

  await service.setFollowUp(repos, lead.id, new Date(Date.now() + HOUR), FOUNDER, new Date(), { note: "Ring after lunch" });
  await service.completeFollowUp(repos, lead.id, FOUNDER);
  await service.assignOwner(repos, lead.id, "staff_x", FOUNDER);
  await service.logContact(repos, lead.id, { channel: "PHONE_CALL", outcome: "BUSY" }, FOUNDER);
  await service.logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "SENT" }, FOUNDER);

  const events = await repos.events.listByLead(lead.id);
  const tail = events.slice(-5).map((event) => event.eventType);
  assert.deepEqual(tail, ["FOLLOW_UP_SET", "FOLLOW_UP_COMPLETED", "OWNER_CHANGED", "CONTACT_LOGGED", "CONTACT_LOGGED"]);
  assert.equal((await repos.leads.getById(lead.id))?.nextFollowUpAt, null);
  assert.equal((await repos.leads.getById(lead.id))?.ownerId, "staff_x");
});

test("postgres: history is still append-only after Stage 4 (no edit or delete of a temperature event)", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const lead = await capture(await testDeveloper(), "Immutable Buyer");
  await service.setTemperature(repos, lead.id, "COLD", FOUNDER);

  const refusal = (error: unknown) => /append-only/.test(String((error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message));
  await assert.rejects(() => db.execute(sql`update lead_events set event_type = 'NOTE_ADDED' where lead_id = ${lead.id}::uuid and event_type = 'TEMPERATURE_CHANGED'`), refusal);
  await assert.rejects(() => db.execute(sql`delete from lead_events where lead_id = ${lead.id}::uuid and event_type = 'TEMPERATURE_CHANGED'`), refusal);
});

test("postgres: list and counts agree exactly with the reference view rules on the same rows", { skip }, async () => {
  const { service, pg, views, schema, db } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const now = new Date();
  const endOfToday = views.endOfDayIn(now);

  const make = async (name: string) => capture(developer, name);
  const hot = await make("View Hot");
  const warm = await make("View Warm");
  const cold = await make("View Cold");
  const lostHot = await make("View Lost Hot");
  const overdue = await make("View Overdue");
  const today = await make("View Due Today");
  const qualified = await make("View Qualified");
  const erased = await make("View Erased");

  await service.setTemperature(repos, hot.id, "HOT", FOUNDER);
  await service.setTemperature(repos, warm.id, "WARM", FOUNDER);
  await service.setTemperature(repos, cold.id, "COLD", FOUNDER);
  await service.setTemperature(repos, lostHot.id, "HOT", FOUNDER);
  await service.changeLeadStatus(repos, lostHot.id, "LOST", FOUNDER, { reasonCode: "PRICE" });
  await service.setFollowUp(repos, overdue.id, new Date(now.getTime() - 3 * HOUR), FOUNDER);
  await service.setFollowUp(repos, today.id, new Date(Math.min(now.getTime() + 60_000, endOfToday.getTime() - 1)), FOUNDER);
  await service.changeLeadStatus(repos, qualified.id, "QUALIFIED", FOUNDER);
  await service.setTemperature(repos, erased.id, "HOT", FOUNDER);
  await service.eraseLead(repos, erased.id, FOUNDER);

  // The reference answer, computed in JavaScript from EVERY row in the table.
  const all = (await db.select().from(schema.leads)).map((row) => ({ ...row }));

  const sqlCounts = await repos.leads.counts(now, endOfToday);
  assert.deepEqual(sqlCounts, views.countLeads(all, now, endOfToday), "dashboard counts match the reference");

  for (const view of ["all", "new", "hot", "warm", "cold", "overdue", "due_today", "qualified"] as const) {
    const expected = all.filter((lead) => views.matchesView(lead, view, now, endOfToday)).sort(views.compareForView(view)).map((lead) => lead.id);
    const collected: string[] = [];
    let total = -1;
    for (let offset = 0; offset < expected.length + 50; offset += 50) {
      const page = await repos.leads.list({ view, limit: 50, offset, now, endOfToday });
      total = page.total;
      collected.push(...page.leads.map((lead) => lead.id));
      if (page.leads.length < 50) break;
    }
    assert.equal(total, expected.length, `${view}: total`);
    assert.deepEqual(collected, expected, `${view}: same leads in the same order`);
  }

  // Sanity: the fixtures landed where intended.
  const ids = async (view: "hot" | "overdue" | "due_today") =>
    new Set(all.filter((lead) => views.matchesView(lead, view, now, endOfToday)).map((lead) => lead.id));
  assert.ok((await ids("hot")).has(hot.id));
  assert.ok(!(await ids("hot")).has(lostHot.id), "a LOST lead is not a live hot lead");
  assert.ok(!(await ids("hot")).has(erased.id), "an erased lead is never counted");
  assert.ok((await ids("overdue")).has(overdue.id));
  assert.ok((await ids("due_today")).has(today.id));
});

test("postgres: the list is bounded by its limit, and developer names come from one batched lookup", { skip }, async () => {
  const { pg, reads } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  await capture(developer, "Batch One");
  await capture(developer, "Batch Two");

  const page = await reads.getLeadsPage(repos, "all", 1, new Date(), 2);
  assert.equal(page.items.length, 2);
  assert.ok(page.total >= 2);

  const names = await repos.leads.developerNames([developer.id, randomUUID()]);
  assert.deepEqual(names, { [developer.id]: developer.displayName });
  assert.deepEqual(await repos.leads.developerNames([]), {});
});

test("postgres: lead detail returns first and latest touch as separate records", { skip }, async () => {
  const { service, pg, reads } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const phone = await freshPhone();
  const input = (sessionId: string, source: string, path: string) => ({
    phone,
    name: "Touch Buyer",
    email: null,
    contactPreference: "WHATSAPP" as const,
    developer,
    website: { url: "https://example.test/", domain: "example.test", verifiedAt: new Date("2026-09-01T00:00:00.000Z") },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: path, utmSource: source },
  });
  const first = await service.captureAssistanceLead(repos, input("touch-a", "google", "/first"));
  await service.captureAssistanceLead(repos, input("touch-b", "facebook", "/second"), new Date(Date.now() + 1000));

  const detail = await reads.getLeadDetail(repos, first.lead.id);
  assert.equal(detail?.firstTouch?.utmSource, "google");
  assert.equal(detail?.lastTouch?.utmSource, "facebook");
  assert.notEqual(detail?.firstTouch?.id, detail?.lastTouch?.id);
});
