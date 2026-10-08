import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Phase 2 Step 1 against the REAL PostgreSQL adapter and migration 0018, on the disposable test database only
 * (skipped when TEST_DATABASE_URL is unset). Proves: the team table and its constraints, no duplicate members,
 * assignment through the real lead repository, history preserved, and that the append-only trigger still holds for
 * the new EMPLOYEE actor type.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };

async function modules() {
  const [service, staffSvc, leadPg, staffPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../../leads/lead-service.ts"),
    import("../../staff-service.ts"),
    import("../../../leads/db/postgres-repository.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../../leads/phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, staffSvc, leadPg, staffPg, schema, db: client.getDb(), phone, sql: drizzle.sql };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

async function newLead() {
  const { service, leadPg, schema, db } = await modules();
  const developerId = randomUUID();
  const slug = `test-staff-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Staff Integration Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `staff-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name: "TEST Staff Buyer",
    email: null,
    contactPreference: "WHATSAPP",
    developer: { id: developerId, slug, displayName: "TEST — Staff Integration Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return lead;
}

const newUserId = () => `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

test("integration: the team table enforces one row per sign-in identity and rejects bad rows", { skip }, async () => {
  const { staffSvc, staffPg, schema, db } = await modules();
  const repo = staffPg.createPostgresStaffRepository();
  const userId = newUserId();
  const member = await staffSvc.addStaffMember(repo, { userId, displayName: "TEST Employee" }, FOUNDER);
  assert.equal(member.active, true);
  assert.equal(member.role, "EMPLOYEE");

  await assert.rejects(staffSvc.addStaffMember(repo, { userId, displayName: "Again" }, FOUNDER), /already on the team/);
  await assert.rejects(
    db.insert(schema.staffMembers).values({ id: randomUUID(), employeeId: "DC999999", userId: newUserId(), displayName: "   ", createdBy: "x" }),
    "blank names are rejected by the database itself",
  );

  const off = await staffSvc.setStaffActive(repo, member.id, false, FOUNDER);
  assert.equal(off.active, false);
  assert.ok(off.deactivatedAt instanceof Date);
  assert.equal(off.deactivatedBy, FOUNDER.actorId);
  assert.equal((await repo.getByUserId(userId))?.id, member.id);
});

test("integration: assignment, reassignment and return-to-founder go through the real repository and keep history", { skip }, async () => {
  const { service, staffSvc, leadPg, staffPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const staff = staffPg.createPostgresStaffRepository();
  const lead = await newLead();
  const one = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST One" }, FOUNDER);
  const two = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST Two" }, FOUNDER);

  await service.assignLead(repos, staff, lead.id, one.id, FOUNDER);
  await service.assignLead(repos, staff, lead.id, two.id, FOUNDER);
  const owned = await repos.leads.getById(lead.id);
  assert.equal(owned?.ownerId, two.userId);

  const owner = (await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "OWNER_CHANGED");
  assert.deepEqual(owner.map((e) => e.payload), [{ from: null, to: one.userId }, { from: one.userId, to: two.userId }]);

  const counts = await repos.leads.countByOwner();
  assert.equal(counts[two.userId], 1);
  assert.equal(counts[one.userId], undefined);

  await service.assignLead(repos, staff, lead.id, null, FOUNDER);
  assert.equal((await repos.leads.getById(lead.id))?.ownerId, null);
});

test("integration: an employee works their own lead (event stored as EMPLOYEE) and is refused on another's", { skip }, async () => {
  const { service, staffSvc, leadPg, staffPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const staff = staffPg.createPostgresStaffRepository();
  const mine = await newLead();
  const other = await newLead();
  const member = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST Worker" }, FOUNDER);
  await service.assignLead(repos, staff, mine.id, member.id, FOUNDER);
  const actor = staffSvc.authorizeStaffActor(member);

  await service.addNote(repos, mine.id, "Called, will visit Saturday", actor);
  const event = (await service.getLeadTimeline(repos, mine.id)).find((e) => e.eventType === "NOTE_ADDED");
  assert.equal(event?.actorType, "EMPLOYEE");
  assert.equal(event?.actorId, member.userId);

  await assert.rejects(service.addNote(repos, other.id, "not mine", actor), /Lead not found/);
  assert.equal((await service.getLeadTimeline(repos, other.id)).some((e) => e.eventType === "NOTE_ADDED"), false);
});

test("integration: history stays append-only for the EMPLOYEE actor type (the trigger still blocks edits)", { skip }, async () => {
  const { service, leadPg, db, sql } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead();
  await service.addNote(repos, lead.id, "kept", FOUNDER);
  const event = (await service.getLeadTimeline(repos, lead.id)).find((e) => e.eventType === "NOTE_ADDED");
  assert.ok(event);
  await assert.rejects(db.execute(sql`UPDATE lead_events SET actor_type = 'EMPLOYEE' WHERE id = ${event.id}`));
  await assert.rejects(db.execute(sql`DELETE FROM lead_events WHERE id = ${event.id}`));
});
