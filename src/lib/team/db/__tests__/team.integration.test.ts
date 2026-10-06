import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The team workspace against the REAL PostgreSQL adapter (migrations 0017 + 0018), on the disposable test database
 * only (skipped when TEST_DATABASE_URL is unset). Proves the owner scope is enforced IN SQL on every filter and
 * that the new follow-up-due view agrees with the reference rule in lead-views.ts.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };
const HOUR = 3_600_000;

async function modules() {
  const [service, reads, views, staffSvc, access, leadPg, staffPg, schema, client, phone] = await Promise.all([
    import("../../../leads/lead-service.ts"),
    import("../../../leads/lead-reads.ts"),
    import("../../../leads/lead-views.ts"),
    import("../../../staff/staff-service.ts"),
    import("../../../staff/employee-access.ts"),
    import("../../../leads/db/postgres-repository.ts"),
    import("../../../staff/db/postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../../leads/phone.ts"),
  ]);
  return { service, reads, views, staffSvc, access, leadPg, staffPg, schema, db: client.getDb(), phone };
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
  const slug = `test-team-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Team Integration Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `team-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name: `TEST ${label}`,
    email: null,
    contactPreference: "WHATSAPP",
    developer: { id: developerId, slug, displayName: "TEST — Team Integration Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return lead;
}

const newUserId = () => `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

test("integration: Clerk user → active staff member → actor, against the real table; inactive and unknown are denied", { skip }, async () => {
  const { staffSvc, access, staffPg } = await modules();
  const staff = staffPg.createPostgresStaffRepository();
  const userId = newUserId();
  const member = await staffSvc.addStaffMember(staff, { userId, displayName: "TEST Resolver" }, FOUNDER);
  assert.deepEqual((await access.resolveEmployee(staff, userId))?.actor, { actorType: "EMPLOYEE", actorId: userId });
  assert.equal(await access.resolveEmployee(staff, newUserId()), null);
  await staffSvc.setStaffActive(staff, member.id, false, FOUNDER);
  assert.equal(await access.resolveEmployee(staff, userId), null);
});

test("integration: My Leads is owner-scoped in SQL on every filter, and follow-up-due agrees with the reference rule", { skip }, async () => {
  const { service, reads, views, staffSvc, access, leadPg, staffPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const staff = staffPg.createPostgresStaffRepository();
  const a = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST A" }, FOUNDER);
  const b = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST B" }, FOUNDER);
  const actorA = (await access.resolveEmployee(staff, a.userId))!.actor;
  const actorB = (await access.resolveEmployee(staff, b.userId))!.actor;

  const overdue = await newLead("A overdue");
  const later = await newLead("A later");
  const hot = await newLead("A hot");
  const theirs = await newLead("B overdue");
  const nobody = await newLead("unassigned overdue");
  for (const [lead, member] of [[overdue, a], [later, a], [hot, a], [theirs, b]] as const) await service.assignLead(repos, staff, lead.id, member.id, FOUNDER);

  const now = new Date();
  // Due soon today (NOT overdue: an employee with an overdue follow-up is restricted to resolving it, which is its own test).
  const dueToday = new Date(Math.min(now.getTime() + 10 * 60_000, views.endOfDayIn(now).getTime() - 1000));
  await service.setFollowUp(repos, overdue.id, dueToday, actorA);
  await service.setFollowUp(repos, later.id, new Date(now.getTime() + 72 * HOUR), actorA);
  await service.setFollowUp(repos, theirs.id, dueToday, actorB);
  await service.setFollowUp(repos, nobody.id, dueToday, FOUNDER);
  await service.setTemperature(repos, hot.id, "HOT", FOUNDER);
  await service.setTemperature(repos, theirs.id, "HOT", FOUNDER);

  const ids = async (actor: typeof actorA, view: "all" | "new" | "follow_up_due" | "hot") =>
    (await reads.getMyLeadsPage(repos, actor, view, 1, now)).items.map((i) => i.lead.id).sort();

  assert.deepEqual(await ids(actorA, "all"), [overdue.id, later.id, hot.id].sort());
  assert.deepEqual(await ids(actorB, "all"), [theirs.id]);
  assert.deepEqual(await ids(actorA, "new"), [overdue.id, later.id, hot.id].sort(), "all three are still NEW; B's and the unassigned are excluded");
  assert.deepEqual(await ids(actorA, "hot"), [hot.id]);
  assert.deepEqual(await ids(actorA, "follow_up_due"), [overdue.id]);

  // SQL vs the pure reference rule on the same rows.
  const endOfToday = views.endOfDayIn(now);
  for (const lead of await Promise.all([overdue, later, hot, theirs].map(async (l) => (await repos.leads.getById(l.id))!))) {
    const inSql = (await repos.leads.list({ view: "follow_up_due", ownerId: lead.ownerId!, limit: 50, offset: 0, now, endOfToday })).leads.some((x) => x.id === lead.id);
    assert.equal(inSql, views.matchesView(lead, "follow_up_due", now, endOfToday), `lead ${lead.name}`);
  }
});

test("integration: an employee views only their own lead's detail; another's, an unassigned and an erased one all return null", { skip }, async () => {
  const { service, reads, staffSvc, access, leadPg, staffPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const staff = staffPg.createPostgresStaffRepository();
  const a = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST A2" }, FOUNDER);
  const b = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: "TEST B2" }, FOUNDER);
  const actorA = (await access.resolveEmployee(staff, a.userId))!.actor;
  const mine = await newLead("mine");
  const his = await newLead("his");
  const loose = await newLead("loose");
  await service.assignLead(repos, staff, mine.id, a.id, FOUNDER);
  await service.assignLead(repos, staff, his.id, b.id, FOUNDER);

  assert.equal((await reads.getMyLeadDetail(repos, actorA, mine.id))?.lead.id, mine.id);
  assert.equal(await reads.getMyLeadDetail(repos, actorA, his.id), null);
  assert.equal(await reads.getMyLeadDetail(repos, actorA, loose.id), null);
  assert.equal(await reads.getMyLeadDetail(repos, actorA, randomUUID()), null);

  await service.addNote(repos, mine.id, "visit planned", actorA);
  await service.eraseLead(repos, mine.id, FOUNDER);
  assert.equal(await reads.getMyLeadDetail(repos, actorA, mine.id), null, "erased leaves the employee's reach");
});
