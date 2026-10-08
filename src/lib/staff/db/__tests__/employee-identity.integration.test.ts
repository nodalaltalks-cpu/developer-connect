import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Employee identity and lifecycle (migration 0027) against the REAL PostgreSQL adapter, on the disposable test database
 * only (skipped when TEST_DATABASE_URL is unset). Proves: IDs are unique even under concurrent creation and never
 * reused, the database itself refuses to delete or re-number a person, exit keeps every record and ownership history,
 * and the Founder-only profile reads work after an exit.
 */
const skip = !hasTestDatabase;
const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };
const newUserId = () => `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
const uniqueEmail = () => `it-${randomUUID()}@example.test`;

async function modules() {
  const [service, staffSvc, leadPg, staffPg, schema, client, phone, drizzle, profile] = await Promise.all([
    import("../../../leads/lead-service.ts"),
    import("../../staff-service.ts"),
    import("../../../leads/db/postgres-repository.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../../leads/phone.ts"),
    import("drizzle-orm"),
    import("../../../leads/employee-profile.ts"),
  ]);
  return { service, staffSvc, leadPg, staffPg, schema, db: client.getDb(), phone, sql: drizzle.sql, profile };
}

async function newLead() {
  const { service, leadPg, schema, db, phone } = await modules();
  const developerId = randomUUID();
  const slug = `test-identity-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Identity Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `ident-${randomUUID()}`;
  let e164 = "";
  for (let i = 0; i < 50 && !e164; i++) {
    const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (r.ok) e164 = r.e164;
  }
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: e164,
    name: "TEST Identity Buyer",
    email: null,
    contactPreference: "WHATSAPP",
    developer: { id: developerId, slug, displayName: "TEST — Identity Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return lead;
}

async function invite(approve = true, userId?: string) {
  const { staffSvc, staffPg } = await modules();
  const repo = staffPg.createPostgresStaffRepository();
  const member = await staffSvc.inviteStaffMember(repo, { displayName: "TEST Identity", email: uniqueEmail(), userId: userId ?? null }, FOUNDER);
  const approved = approve ? await staffSvc.approveStaffMember(repo, member.id, FOUNDER) : member;
  return { repo, member: approved };
}

test("integration: concurrent invitations get distinct, well-formed DC IDs", { skip }, async () => {
  const { staffSvc, staffPg } = await modules();
  const repo = staffPg.createPostgresStaffRepository();
  const made = await Promise.all(Array.from({ length: 8 }, () => staffSvc.inviteStaffMember(repo, { displayName: "TEST Race", email: uniqueEmail() }, FOUNDER)));
  const ids = made.map((m) => m.employeeId);
  assert.equal(new Set(ids).size, 8);
  for (const id of ids) assert.match(id, /^DC[2-9]|^DC[1-9][0-9]+$/);
  assert.ok(!ids.includes("DC1"), "DC1 belongs to the Founder");
});

test("integration: an ID is never reused after an exit, and lookup by ID is case-insensitive", { skip }, async () => {
  const { staffSvc } = await modules();
  const { repo, member } = await invite();
  const number = Number(member.employeeId.slice(2));
  await staffSvc.exitStaffMember(repo, member.id, "RESIGNED", FOUNDER);
  const next = await invite();
  assert.ok(Number(next.member.employeeId.slice(2)) > number, "the next ID is higher than an exited person's");
  const found = await staffSvc.findStaffByEmployeeId(repo, member.employeeId.toLowerCase(), FOUNDER);
  assert.equal(found?.id, member.id);
  assert.equal(found?.status, "EXITED", "an exited person is still findable");
});

test("integration: the database refuses to delete a person or change their employee ID", { skip }, async () => {
  const { db, sql } = await modules();
  const { member } = await invite();
  await assert.rejects(db.execute(sql`DELETE FROM staff_members WHERE id = ${member.id}`));
  await assert.rejects(db.execute(sql`UPDATE staff_members SET employee_id = 'DC999998' WHERE id = ${member.id}`));
  await assert.rejects(db.execute(sql`UPDATE staff_members SET employee_id = 'dc5' WHERE id = ${member.id}`), "malformed IDs are rejected by a constraint");
});

test("integration: duplicate live emails are refused by the database; a second employee ID row cannot reuse an ID", { skip }, async () => {
  const { staffSvc, staffPg, db, schema, sql } = await modules();
  const repo = staffPg.createPostgresStaffRepository();
  const email = uniqueEmail();
  const first = await staffSvc.inviteStaffMember(repo, { displayName: "TEST A", email }, FOUNDER);
  await assert.rejects(staffSvc.inviteStaffMember(repo, { displayName: "TEST B", email: email.toUpperCase() }, FOUNDER));
  await assert.rejects(db.insert(schema.staffMembers).values({ id: randomUUID(), employeeId: first.employeeId, userId: newUserId(), displayName: "TEST dup", createdBy: "x" }));
  void sql;
});

test("integration: an exited person is frozen; lifecycle events are append-only", { skip }, async () => {
  const { staffSvc, db, sql } = await modules();
  const { repo, member } = await invite(true, newUserId());
  await staffSvc.exitStaffMember(repo, member.id, "CONTRACT_ENDED", FOUNDER);
  await assert.rejects(db.execute(sql`UPDATE staff_members SET status = 'ACTIVE', active = true, deactivated_at = null WHERE id = ${member.id}`), "no self-reactivation, not even by direct SQL");
  const events = await repo.listEvents(member.id, 50);
  assert.ok(events.length >= 3);
  await assert.rejects(db.execute(sql`DELETE FROM staff_events WHERE id = ${events[0].id}`));
  await assert.rejects(db.execute(sql`UPDATE staff_events SET employee_id = 'DC1' WHERE id = ${events[0].id}`));
});

test("integration: first sign-in links an approved invitee exactly once; a pending or unverified account is denied", { skip }, async () => {
  const { staffSvc, staffPg } = await modules();
  const repo = staffPg.createPostgresStaffRepository();
  const email = uniqueEmail();
  const pending = await staffSvc.inviteStaffMember(repo, { displayName: "TEST Pending", email }, FOUNDER);
  const clerk = newUserId();
  assert.equal(await staffSvc.claimInvitation(repo, clerk, [email]), null, "not approved yet");
  await staffSvc.approveStaffMember(repo, pending.id, FOUNDER);
  assert.equal(await staffSvc.claimInvitation(repo, clerk, []), null, "no verified email");
  const results = await Promise.all([staffSvc.claimInvitation(repo, clerk, [email]), staffSvc.claimInvitation(repo, newUserId(), [email])]);
  assert.equal(results.filter(Boolean).length, 1, "exactly one account wins the claim");
  assert.equal((await repo.getByEmployeeId(pending.employeeId))?.status, "ACTIVE");
});

test("integration: exit keeps the person's leads, history and attribution; open leads can be returned and history shows both", { skip }, async () => {
  const { service, staffSvc, leadPg, profile } = await modules();
  const { repo, member } = await invite(true, newUserId());
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead();
  await service.assignLead(repos, repo, lead.id, member.id, FOUNDER);
  const actor = staffSvc.authorizeStaffActor(await repo.getById(member.id));
  await service.addNote(repos, lead.id, "kept after exit", actor);

  await staffSvc.exitStaffMember(repo, member.id, "TERMINATED", FOUNDER);
  const stillOwned = await repos.leads.getById(lead.id);
  assert.equal(stillOwned?.ownerId, member.userId, "ownership is untouched by the exit");
  const note = (await service.getLeadTimeline(repos, lead.id)).find((e) => e.eventType === "NOTE_ADDED");
  assert.equal(note?.actorId, member.userId, "the note stays attributed to them");

  const other = (await invite(true, newUserId())).member;
  await assert.rejects(service.assignLead(repos, repo, lead.id, member.id, FOUNDER), "nothing new can be assigned to an exited person");
  void other;

  const result = await profile.returnOpenLeadsToFounder(repos, repo, FOUNDER, member.employeeId);
  assert.ok(result.returned >= 1);
  assert.equal((await repos.leads.getById(lead.id))?.ownerId, null);
  const changes = (await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "OWNER_CHANGED").map((e) => e.payload);
  assert.deepEqual(changes, [{ from: null, to: member.userId }, { from: member.userId, to: null }], "timeline: owned by them, then returned by the Founder");
  assert.equal(note?.actorId, member.userId);
});

test("integration: the Founder-only profile reads an exited person and pages their history", { skip }, async () => {
  const { service, staffSvc, leadPg, profile } = await modules();
  const { repo, member } = await invite(true, newUserId());
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead();
  await service.assignLead(repos, repo, lead.id, member.id, FOUNDER);
  const actor = staffSvc.authorizeStaffActor(await repo.getById(member.id));
  for (let i = 0; i < 3; i++) await service.addNote(repos, lead.id, `note ${i}`, actor);
  await staffSvc.exitStaffMember(repo, member.id, "OTHER", FOUNDER);

  const result = await profile.getEmployeeProfile(repos, repo, FOUNDER, member.employeeId.toLowerCase());
  assert.equal(result.kind, "EMPLOYEE");
  if (result.kind !== "EMPLOYEE") return;
  assert.equal(result.profile.member.status, "EXITED");
  assert.equal(result.profile.sales.leadsActedOn >= 1, true);
  assert.ok(result.profile.history.length >= 3);
  assert.ok(result.profile.lifecycle.some((e) => e.eventType === "EMPLOYEE_EXITED"));
  const oldest = result.profile.history[result.profile.history.length - 1];
  const older = await profile.getEmployeeHistoryPage(repos, repo, FOUNDER, member.employeeId, oldest.createdAt);
  assert.ok(older.every((e) => e.createdAt < oldest.createdAt), "the next page only has older events");

  assert.deepEqual(await profile.getEmployeeProfile(repos, repo, FOUNDER, "DC1"), { kind: "FOUNDER" });
  assert.deepEqual(await profile.getEmployeeProfile(repos, repo, FOUNDER, "DC999999"), { kind: "NOT_FOUND" });
  assert.deepEqual(await profile.getEmployeeProfile(repos, repo, FOUNDER, "'; drop table"), { kind: "NOT_FOUND" });
});

test("integration: an employee (any other actor) cannot read a profile or its history, or return leads", { skip }, async () => {
  const { staffSvc, leadPg, profile } = await modules();
  const { repo, member } = await invite(true, newUserId());
  const repos = leadPg.createPostgresLeadRepositories();
  const employee = staffSvc.authorizeStaffActor(await repo.getById(member.id));
  await assert.rejects(profile.getEmployeeProfile(repos, repo, employee, member.employeeId));
  await assert.rejects(profile.getEmployeeHistoryPage(repos, repo, employee, member.employeeId, new Date()));
  await assert.rejects(profile.returnOpenLeadsToFounder(repos, repo, employee, member.employeeId));
  await assert.rejects(profile.getEmployeeProfile(repos, repo, { actorType: "BUYER" } as never, member.employeeId));
});

test("integration: a member change and its audit event are ONE transaction - if the event is refused, the change is rolled back", { skip }, async () => {
  const { staffSvc, db, schema, sql } = await modules();
  const { repo, member } = await invite();
  const before = await repo.getById(member.id);
  // An event type the database refuses (check constraint) must undo the email change made in the same transaction.
  await assert.rejects(repo.update(member.id, { email: uniqueEmail() }, new Date(), [{ eventType: "NOT_A_REAL_EVENT" as never, actorId: FOUNDER.actorId }]));
  const after = await repo.getById(member.id);
  assert.equal(after?.email, before?.email, "the email did not change without its audit event");
  assert.equal((await repo.listEvents(member.id, 50)).length, 2, "invite + approve events only");
  // And the happy path writes both together.
  const changed = await staffSvc.changeStaffEmail(repo, member.id, uniqueEmail(), FOUNDER);
  assert.notEqual(changed.email, before?.email);
  const events = await repo.listEvents(member.id, 50);
  assert.equal(events.filter((e) => e.eventType === "EMPLOYEE_EMAIL_CHANGED").length, 1);
  assert.equal(events.find((e) => e.eventType === "EMPLOYEE_EMAIL_CHANGED")?.payload.from, before?.email);
  void db; void schema; void sql;
});
