import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** The Cold Call intake against the REAL PostgreSQL adapter (test database only): one transaction, nested via savepoints. */
const skip = !hasTestDatabase;

const mobile = () => "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");

async function setup() {
  const [leadPg, intake, projectService, errors, schema, client, drizzle] = await Promise.all([
    import("../postgres-repository.ts"),
    import("../../cold-call-lead-service.ts"),
    import("../../project-service.ts"),
    import("../../errors.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  const db = client.getDb();
  const repos = leadPg.createPostgresLeadRepositories();
  const developerId = randomUUID();
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Intake Co", slug: `test-intake-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
  const founder = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const make = (name: string) => projectService.createProject(repos, { developerId, name: `${name} ${randomUUID().slice(0, 6)}`, city: "Thane", locality: "Ghodbunder Road", propertyType: "Apartment", configurations: ["2 BHK"] }, founder);
  const employee = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  return { repos, intake, errors, db, schema, eq: drizzle.eq, founder, employee, p1: await make("Intake One"), p2: await make("Intake Two") };
}

test("integration: a full cold call saves as ONE COLD_CALL lead with projects, requirement, follow-up and note; a repeat is a duplicate, not a second lead", { skip }, async () => {
  const { repos, intake, employee, p1, p2 } = await setup();
  const phone = mobile();
  const when = new Date(Date.now() + 26 * 3_600_000);
  const result = await intake.saveColdCallLead(repos, {
    phone, name: "TEST Cold Caller", interest: "INTERESTED", qualification: { outcome: "QUALIFIED", reason: "NEGOTIATION" },
    projectIds: [p1.id, p2.id], requirement: { locations: ["Thane"], configuration: "2 BHK", budgetMin: 6_000_000, budgetMax: 9_000_000, budgetCurrency: "INR" },
    plan: { kind: "CALL", scheduledAt: when, note: "Floor plans" }, note: "Wants a high floor.",
  }, employee);
  assert.ok(result.saved);
  assert.equal(result.createdLead, true);
  const lead = (await repos.leads.findByPhone(phone))!;
  assert.equal(lead.id, result.leadId);
  assert.equal(lead.sourceType, "COLD_CALL");
  assert.equal(lead.creationMethod, "COLD_CALLING");
  assert.equal(lead.ownerId, employee.actorId);
  assert.equal(lead.status, "QUALIFIED", "the qualification is the status; interest in projects did not advance it");
  assert.equal((await repos.shortlist.listByLead(lead.id)).filter((e) => e.removedAt === null).length, 2);
  assert.equal((await repos.requirements.getActiveByLead(lead.id))?.configuration, "2 BHK");
  const followUps = await repos.followUps.listByLead(lead.id);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].type, "CALL_BACK");
  const kinds = (await repos.events.listByLead(lead.id)).map((e) => e.eventType);
  for (const expected of ["LEAD_CREATED", "STATUS_CHANGED", "QUALIFICATION_RECORDED", "REQUIREMENT_CREATED", "PROJECT_SHORTLISTED", "FOLLOW_UP_SET", "NOTE_ADDED"]) assert.ok(kinds.includes(expected as never), `${expected} in ${kinds.join(",")}`);

  const again = await intake.saveColdCallLead(repos, { phone, interest: "NOT_LOOKING" }, employee);
  assert.deepEqual(again, { saved: false, reason: "EXISTS_YOURS", leadId: lead.id, leadName: "TEST Cold Caller" });
  assert.equal((await repos.leads.getById(lead.id))!.status, "QUALIFIED", "the duplicate attempt changed nothing");
});

test("integration: ALL OR NOTHING in the real database - a failure at the last step rolls back the lead and every event", { skip }, async () => {
  const { repos, intake, errors, db, schema, eq, employee, p1 } = await setup();
  const phone = mobile();
  await assert.rejects(
    intake.saveColdCallLead(repos, {
      phone, name: "TEST Rollback", interest: "INTERESTED", qualification: { outcome: "QUALIFIED" },
      projectIds: [p1.id, randomUUID()], // the second project does not exist: the shortlist step fails after the lead exists
      plan: { kind: "CALL", scheduledAt: new Date(Date.now() + 26 * 3_600_000) }, note: "Should vanish",
    }, employee),
    errors.LeadNotFoundError,
  );
  assert.equal(await repos.leads.findByPhone(phone), null, "the lead was rolled back");
  const leftovers = await db.select({ id: schema.leadEvents.id }).from(schema.leadEvents).where(eq(schema.leadEvents.actorId, employee.actorId));
  assert.equal(leftovers.length, 0, "and so was every event the failed attempt wrote");
});

test("integration: another employee's number is refused without revealing it; a lead past qualification is refused and saves nothing", { skip }, async () => {
  const { repos, intake, errors, employee } = await setup();
  const other = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const phone = mobile();
  const mine = await intake.saveColdCallLead(repos, { phone, interest: "INTERESTED", qualification: { outcome: "PENDING_QUALIFICATION" } }, employee);
  assert.ok(mine.saved);
  assert.deepEqual(await intake.saveColdCallLead(repos, { phone, name: "Intruder", interest: "INTERESTED", qualification: { outcome: "QUALIFIED" } }, other), { saved: false, reason: "EXISTS_NOT_YOURS" });
  await assert.rejects(intake.saveColdCallLead(repos, { leadId: mine.leadId, interest: "NOT_LOOKING" }, other), errors.LeadNotFoundError);
  assert.equal((await repos.leads.getById(mine.leadId))!.status, "CONTACTED");
});
