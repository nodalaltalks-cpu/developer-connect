import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Phase 4 (projects, shortlist, site visits) against the REAL PostgreSQL adapter and migration 0023, on the disposable
 * test database only (skipped when TEST_DATABASE_URL is unset).
 */
const skip = !hasTestDatabase;
const HOUR = 3_600_000;

async function modules() {
  const [service, projects, visits, pipeline, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../project-service.ts"),
    import("../../site-visit-service.ts"),
    import("../../pipeline.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, projects, visits, pipeline, leadPg, schema, db: client.getDb(), phone, sql: drizzle.sql };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let i = 0; i < 50; i++) {
    const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (r.ok) return r.e164;
  }
  throw new Error("no phone");
}

async function developer() {
  const { schema, db } = await modules();
  const id = randomUUID();
  await db.insert(schema.developers).values({ id, displayName: "TEST — Phase4 Co", slug: `test-phase4-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
  return id;
}

async function ownedLead(ownerId: string) {
  const { service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = await developer();
  const sessionId = `p4-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(repos, { phone: await freshPhone(), name: "TEST p4", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug: `s-${dev}`, displayName: "TEST — Phase4 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x" } });
  return { lead: await repos.leads.update(lead.id, { ownerId }, new Date()), dev };
}

const founder = () => ({ actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 12)}` });
const employee = () => ({ actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 12)}` });
const refusal = (re: RegExp) => (error: unknown) => re.test(`${(error as Error).message} ${((error as { cause?: Error }).cause?.message) ?? ""}`);

test("integration: Founder creates a project; duplicates per developer, bad prices and a missing currency are refused by the application AND the database", { skip }, async () => {
  const { projects, leadPg, db, schema } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = await developer();
  const f = founder();
  const p = await projects.createProject(repos, { developerId: dev, name: "Phase4 Heights", city: "Thane", configurations: ["2 BHK"], priceMin: 5_000_000, priceMax: 9_000_000, currency: "INR" }, f);
  await assert.rejects(projects.createProject(repos, { developerId: dev, name: "phase4 HEIGHTS", city: "Thane" }, f), /already has a project/);
  await assert.rejects(projects.createProject(repos, { developerId: dev, name: "Bad", city: "X", priceMin: 9, priceMax: 1, currency: "INR" }, f), /minimum price/);
  await assert.rejects(projects.createProject(repos, { developerId: randomUUID(), name: "Orphan", city: "X" }, f), /developer/i);
  // Straight to the database, bypassing the service: the CHECK constraints hold on their own.
  await assert.rejects(db.insert(schema.projects).values({ id: randomUUID(), developerId: dev, name: "Raw", city: "X", priceMin: 100, priceMax: 50, currency: "INR", createdBy: "x" }), refusal(/projects_price_ck|check/i));
  await assert.rejects(db.insert(schema.projects).values({ id: randomUUID(), developerId: dev, name: "Raw2", city: "X", priceMin: 100, createdBy: "x" }), refusal(/projects_currency_ck|check/i));
  assert.equal((await repos.projects.getById(p.id))?.configurations[0], "2 BHK");
});

test("integration: shortlist - one ACTIVE row per lead+project even under concurrency; removal keeps history; the database refuses deletes and rewrites", { skip }, async () => {
  const { projects, leadPg, db, sql } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const e = employee();
  const { lead, dev } = await ownedLead(e.actorId);
  const p = await projects.createProject(repos, { developerId: dev, name: "Shortlist Co", city: "Thane" }, f);
  const results = await Promise.all(Array.from({ length: 4 }, () => projects.shortlistProject(repos, lead.id, p.id, e).then(() => "ok", (err) => (err as Error).message)));
  assert.equal(results.filter((r) => r === "ok").length, 1, "exactly one concurrent shortlist wins");
  const [entry] = (await repos.shortlist.listByLead(lead.id)).filter((x) => x.removedAt === null);
  await assert.rejects(db.execute(sql`DELETE FROM lead_project_shortlist WHERE id = ${entry.id}`), refusal(/DELETE is not permitted/));
  await assert.rejects(db.execute(sql`UPDATE lead_project_shortlist SET project_id = ${randomUUID()} WHERE id = ${entry.id}`), refusal(/identity columns|foreign key/i));
  await projects.removeFromShortlist(repos, lead.id, entry.id, e);
  await assert.rejects(db.execute(sql`UPDATE lead_project_shortlist SET removed_by = 'other' WHERE id = ${entry.id}`), refusal(/removed entry cannot be changed/));
  await projects.shortlistProject(repos, lead.id, p.id, e);
  assert.equal((await repos.shortlist.listByLead(lead.id)).length, 2, "history kept: the removed row and the new active one");
  assert.equal((await repos.leads.getById(lead.id))?.status, "SHORTLISTED");
});

test("integration: site visits - one open visit per lead+project under concurrency; lifecycle; reschedule chain; finished visits are frozen by the database; erasure clears free text", { skip }, async () => {
  const { visits, projects, service, leadPg, db, sql } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const e = employee();
  const { lead, dev } = await ownedLead(e.actorId);
  const p = await projects.createProject(repos, { developerId: dev, name: "Visit Co", city: "Thane" }, f);
  const at = new Date(Date.now() + 2 * HOUR);
  const results = await Promise.all(Array.from({ length: 4 }, () => visits.scheduleSiteVisit(repos, lead.id, { scheduledAt: at, projectId: p.id, notes: "secret note" }, e).then((v) => v.id, (err) => (err as Error).message)));
  const created = results.filter((r) => /^[0-9a-f-]{36}$/.test(r));
  assert.equal(created.length, 1, "exactly one concurrent schedule wins");
  const first = (await repos.siteVisits.listByLead(lead.id))[0];
  assert.equal((await repos.leads.getById(lead.id))?.status, "SITE_VISIT_SCHEDULED");

  const second = await visits.changeSiteVisit(repos, first.id, { kind: "RESCHEDULE", scheduledAt: new Date(Date.now() + 5 * HOUR) }, e);
  assert.equal(second.rescheduledFrom, first.id);
  assert.equal((await repos.siteVisits.getById(first.id))?.status, "RESCHEDULED");
  await assert.rejects(db.execute(sql`UPDATE site_visits SET status = 'CONFIRMED' WHERE id = ${first.id}`), refusal(/finished site visit cannot be changed/));
  await assert.rejects(db.execute(sql`UPDATE site_visits SET lead_id = ${randomUUID()} WHERE id = ${second.id}`), refusal(/identity columns|foreign key/i));
  await assert.rejects(db.execute(sql`DELETE FROM site_visits WHERE id = ${second.id}`), refusal(/DELETE is not permitted/));
  const [ev] = await repos.siteVisits.listEvents(first.id);
  await assert.rejects(db.execute(sql`UPDATE site_visit_events SET event_type = 'X' WHERE id = ${ev.id}`), refusal(/append-only/));
  await assert.rejects(db.execute(sql`DELETE FROM site_visit_events WHERE visit_id = ${first.id}`), refusal(/append-only/));

  // A visit cannot be completed before its time; the clock is the server's (here, the `now` the test passes).
  await assert.rejects(visits.changeSiteVisit(repos, second.id, { kind: "COMPLETE", outcome: "INTERESTED" }, e), /not happened yet/);
  const later = new Date(Date.now() + 6 * HOUR);
  const done = await visits.changeSiteVisit(repos, second.id, { kind: "COMPLETE", outcome: "INTERESTED", nextAction: "call back" }, e, later);
  assert.equal(done.status, "COMPLETED");
  assert.equal((await repos.leads.getById(lead.id))?.status, "SITE_VISIT_DONE");
  const stats = await repos.siteVisits.statsByStaff(new Date(Date.now() - HOUR), new Date(Date.now() + 10 * HOUR));
  assert.equal(stats[e.actorId].scheduled, 1, "the reschedule is not counted as a new visit");

  await service.eraseLead(repos, lead.id, f);
  const erased = (await repos.siteVisits.getById(second.id))!;
  assert.deepEqual([erased.notes, erased.nextAction, erased.status], [null, null, "COMPLETED"], "free text cleared on a finished visit, the visit itself kept");
});

test("integration: IDOR - another employee gets 'not found' for a visit, an entry and a lead's projects; the Founder sees all", { skip }, async () => {
  const { visits, projects, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const a = employee();
  const b = employee();
  const { lead, dev } = await ownedLead(a.actorId);
  const p = await projects.createProject(repos, { developerId: dev, name: "Idor Co", city: "Thane" }, f);
  const visit = await visits.scheduleSiteVisit(repos, lead.id, { scheduledAt: new Date(Date.now() + HOUR) }, a);
  const entry = await projects.shortlistProject(repos, lead.id, p.id, a);
  await assert.rejects(visits.changeSiteVisit(repos, visit.id, { kind: "CONFIRM" }, b), /not found/i);
  await assert.rejects(visits.getLeadVisits(repos, b, lead.id), /not found/i);
  await assert.rejects(projects.getLeadProjects(repos, b, lead.id), /not found/i);
  await assert.rejects(projects.removeFromShortlist(repos, lead.id, entry.id, b), /not found/i);
  assert.equal((await visits.listOpenVisits(repos, b)).filter((v) => v.visit.id === visit.id).length, 0);
  assert.equal((await visits.listOpenVisits(repos, f, new Date(), 500)).filter((v) => v.visit.id === visit.id).length, 1);
  assert.equal((await visits.changeSiteVisit(repos, visit.id, { kind: "CONFIRM" }, f)).status, "CONFIRMED");
});
