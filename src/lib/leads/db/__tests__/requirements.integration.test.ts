import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Buyer requirements (Phase 2, Step 3) against the REAL PostgreSQL adapter and migration 0019, on the disposable
 * test database only (skipped when TEST_DATABASE_URL is unset). Proves the database itself enforces the model
 * (one active requirement per lead, budget rules, unique locations), that history and the owner scope work through
 * the real adapter, that erasure clears free text, and that the 0019 backfill produced well-formed rows.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };

async function modules() {
  const [service, req, reads, staffSvc, access, leadPg, staffPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../requirement-service.ts"),
    import("../../lead-reads.ts"),
    import("../../../staff/staff-service.ts"),
    import("../../../staff/employee-access.ts"),
    import("../postgres-repository.ts"),
    import("../../../staff/db/postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, req, reads, staffSvc, access, leadPg, staffPg, schema, db: client.getDb(), phone, sql: drizzle.sql, eq: drizzle.eq };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

async function newLead(label: string) {
  const { service, leadPg, schema, db } = await modules();
  const developerId = randomUUID();
  const slug = `test-req-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Requirement Integration Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `req-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name: `TEST ${label}`,
    email: null,
    contactPreference: "WHATSAPP",
    developer: { id: developerId, slug, displayName: "TEST — Requirement Integration Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return lead;
}

const FULL = {
  locations: ["Thane", "Navi Mumbai"],
  propertyType: "Apartment",
  configuration: "2 BHK",
  budgetMin: 8_000_000,
  budgetMax: 12_000_000,
  budgetCurrency: "INR" as const,
  purpose: "SELF_USE" as const,
  timeline: "ONE_TO_THREE_MONTHS" as const,
  notes: "Near the station",
};

test("integration: create, update and status change through the real adapter — locations ordered, history events written, lead mirror updated", { skip }, async () => {
  const { req, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("create");

  const created = await req.createRequirement(repos, lead.id, FULL, FOUNDER);
  assert.deepEqual(created.locations, ["Thane", "Navi Mumbai"]);
  const mirrored = await repos.leads.getById(lead.id);
  assert.equal(mirrored?.location, "Thane, Navi Mumbai");
  assert.equal(mirrored?.budgetMax, 12_000_000);

  const { changed } = await req.updateRequirementDetails(repos, lead.id, created.id, { ...FULL, budgetMax: 15_000_000, locations: ["Mumbai", "Thane"] }, FOUNDER);
  assert.deepEqual(changed.sort(), ["budgetMax", "locations"]);
  const stored = await repos.requirements.getById(created.id);
  assert.deepEqual(stored?.locations, ["Mumbai", "Thane"], "the order the user listed them is kept");

  await req.setRequirementStatus(repos, lead.id, created.id, "ON_HOLD", FOUNDER);
  const types = (await repos.events.listByLead(lead.id)).map((e) => e.eventType).filter((t) => t.startsWith("REQUIREMENT_"));
  assert.deepEqual(types, ["REQUIREMENT_CREATED", "REQUIREMENT_UPDATED", "REQUIREMENT_STATUS_CHANGED"]);
});

test("integration: a new requirement closes the active one; history is kept and only one is ever ACTIVE", { skip }, async () => {
  const { req, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("history");
  const first = await req.createRequirement(repos, lead.id, FULL, FOUNDER);
  const second = await req.createRequirement(repos, lead.id, { locations: ["Pune"] }, FOUNDER);
  const history = await repos.requirements.listByLead(lead.id);
  assert.deepEqual(history.map((r) => r.id), [second.id, first.id]);
  assert.deepEqual(history.map((r) => r.status), ["ACTIVE", "CLOSED"]);
  assert.deepEqual((await repos.requirements.getById(first.id))?.locations, ["Thane", "Navi Mumbai"]);
  assert.equal((await repos.requirements.getActiveByLead(lead.id))?.id, second.id);
});

test("integration: the DATABASE enforces the rules even when the service is bypassed", { skip }, async () => {
  const { schema, db, leadPg, req } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("constraints");
  const active = await req.createRequirement(repos, lead.id, { locations: ["Thane"] }, FOUNDER);
  const base = { leadId: lead.id, createdBy: "x", updatedBy: "x" };

  await assert.rejects(db.insert(schema.leadRequirements).values({ id: randomUUID(), ...base, status: "ACTIVE" }), "a second ACTIVE requirement");
  await assert.rejects(db.insert(schema.leadRequirements).values({ id: randomUUID(), ...base, status: "CLOSED", budgetMin: -1, budgetCurrency: "INR" }), "negative budget");
  await assert.rejects(db.insert(schema.leadRequirements).values({ id: randomUUID(), ...base, status: "CLOSED", budgetMin: 9, budgetMax: 5, budgetCurrency: "INR" }), "min above max");
  await assert.rejects(db.insert(schema.leadRequirements).values({ id: randomUUID(), ...base, status: "CLOSED", budgetMax: 5 }), "a budget without a currency");
  await assert.rejects(db.insert(schema.leadRequirements).values({ id: randomUUID(), leadId: randomUUID(), createdBy: "x", updatedBy: "x" }), "a requirement for no lead");
  await assert.rejects(
    db.insert(schema.leadRequirementLocations).values([
      { id: randomUUID(), requirementId: active.id, name: "Thane", nameKey: "thane", position: 5 },
    ]),
    "the same normalised location twice",
  );
  await assert.rejects(db.insert(schema.leadRequirementLocations).values({ id: randomUUID(), requirementId: active.id, name: "  ", nameKey: "x", position: 6 }), "a blank location");
  assert.equal((await repos.requirements.listByLead(lead.id)).length, 1, "nothing invalid was stored");
});

test("integration: an employee's requirement workflow is owner-scoped on the real database — and a foreign requirement id is unusable", { skip }, async () => {
  const { req, reads, service, staffSvc, access, leadPg, staffPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const staff = staffPg.createPostgresStaffRepository();
  const a = await staffSvc.addStaffMember(staff, { userId: `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`, displayName: "TEST Req A" }, FOUNDER);
  const b = await staffSvc.addStaffMember(staff, { userId: `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`, displayName: "TEST Req B" }, FOUNDER);
  const actorA = (await access.resolveEmployee(staff, a.userId))!.actor;
  const actorB = (await access.resolveEmployee(staff, b.userId))!.actor;
  const mine = await newLead("mine");
  const his = await newLead("his");
  await service.assignLead(repos, staff, mine.id, a.id, FOUNDER);
  await service.assignLead(repos, staff, his.id, b.id, FOUNDER);

  const own = await req.createRequirement(repos, mine.id, FULL, actorA);
  assert.equal(own.createdBy, a.userId);
  const hisReq = await req.createRequirement(repos, his.id, { locations: ["Goa"] }, actorB);

  await assert.rejects(req.createRequirement(repos, his.id, FULL, actorA), /Lead not found/);
  await assert.rejects(req.updateRequirementDetails(repos, mine.id, hisReq.id, FULL, actorA), /Requirement not found/, "another lead's requirement id");
  await assert.rejects(req.setRequirementStatus(repos, his.id, hisReq.id, "CLOSED", actorA), /Lead not found/);

  assert.equal((await reads.getMyLeadDetail(repos, actorA, mine.id))?.requirements.length, 1);
  assert.equal(await reads.getMyLeadDetail(repos, actorA, his.id), null);
  assert.equal((await repos.requirements.getById(hisReq.id))?.status, "ACTIVE", "nothing of Rohan's changed");
});

test("integration: erasure clears notes and locations, keeps the structured history, and leaves no free text in events", { skip }, async () => {
  const { req, service, leadPg, schema, db, eq } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("erase");
  const r = await req.createRequirement(repos, lead.id, FULL, FOUNDER);
  await req.updateRequirementDetails(repos, lead.id, r.id, { ...FULL, notes: "Call after 7pm" }, FOUNDER);

  await service.eraseLead(repos, lead.id, FOUNDER);
  const after = await repos.requirements.getById(r.id);
  assert.equal(after?.notes, null);
  assert.deepEqual(after?.locations, []);
  assert.equal(after?.budgetMax, 12_000_000, "the structured band stays");
  const rows = await db.select().from(schema.leadRequirementLocations).where(eq(schema.leadRequirementLocations.requirementId, r.id));
  assert.equal(rows.length, 0);
  const dump = JSON.stringify(await repos.events.listByLead(lead.id));
  for (const secret of ["Thane", "Navi Mumbai", "Call after 7pm"]) assert.ok(!dump.includes(secret), `${secret} must be gone`);
});

test("integration: the 0019 backfill produced well-formed requirements from existing leads (one ACTIVE per lead, normalised single location)", { skip }, async () => {
  const { db, sql } = await modules();
  const dupes = await db.execute(sql`SELECT lead_id FROM lead_requirements WHERE status = 'ACTIVE' GROUP BY lead_id HAVING count(*) > 1`);
  assert.equal(dupes.rows.length, 0, "never two active requirements for a lead");
  const orphans = await db.execute(sql`SELECT l.id FROM lead_requirement_locations l LEFT JOIN lead_requirements r ON r.id = l.requirement_id WHERE r.id IS NULL`);
  assert.equal(orphans.rows.length, 0);
  const keys = await db.execute(sql`SELECT name, name_key FROM lead_requirement_locations WHERE name_key <> lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) AND name_key <> 'bangalore'`);
  assert.equal(keys.rows.length, 0, "every key is the normalised form of its name");
  const erased = await db.execute(sql`SELECT r.id FROM lead_requirements r JOIN leads l ON l.id = r.lead_id WHERE l.erased_at IS NOT NULL AND r.created_by = 'system:migration-0019'`);
  assert.equal(erased.rows.length, 0, "erased leads were not backfilled");
});
