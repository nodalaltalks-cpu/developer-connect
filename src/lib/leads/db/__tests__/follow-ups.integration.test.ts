import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Follow-up discipline against the REAL PostgreSQL adapter and migration 0020, on the disposable test database only
 * (skipped when TEST_DATABASE_URL is unset). Proves the database enforces the lifecycle (one open follow-up per lead),
 * that a miss is recorded exactly once even under concurrent sweeps (atomic claim), the owner scope and the
 * restriction, returning a lead, the in-app notifications through the EXISTING notification table, erasure, and that
 * the 0020 backfill is well-formed.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };
const HOUR = 3_600_000;

async function modules() {
  const [service, fu, reads, leadReads, staffSvc, access, leadPg, staffPg, notifPg, notifier, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../follow-up-service.ts"),
    import("../../follow-up-reads.ts"),
    import("../../lead-reads.ts"),
    import("../../../staff/staff-service.ts"),
    import("../../../staff/employee-access.ts"),
    import("../postgres-repository.ts"),
    import("../../../staff/db/postgres-repository.ts"),
    import("../../../notifications/db/postgres-repository.ts"),
    import("../../lead-notifier.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, fu, reads, leadReads, staffSvc, access, leadPg, staffPg, notifPg, notifier, schema, db: client.getDb(), phone, sql: drizzle.sql, eq: drizzle.eq };
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
  const slug = `test-fu-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: developerId, displayName: "TEST — Follow-up Integration Co", slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  const sessionId = `fu-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(leadPg.createPostgresLeadRepositories(), {
    phone: await freshPhone(),
    name: `TEST ${label}`,
    email: null,
    contactPreference: "PHONE_CALL",
    developer: { id: developerId, slug, displayName: "TEST — Follow-up Integration Co" },
    sourceCta: "developer_page",
    sessionId,
    currentTouch: { sessionId, landingPath: `/developers/${slug}` },
  });
  return lead;
}

const newUserId = () => `user_it_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

async function employee(label: string) {
  const { staffSvc, access, staffPg } = await modules();
  const staff = staffPg.createPostgresStaffRepository();
  const member = await staffSvc.addStaffMember(staff, { userId: newUserId(), displayName: `TEST ${label}` }, FOUNDER);
  return { staff, member, actor: (await access.resolveEmployee(staff, member.userId))!.actor };
}

test("integration: schedule, reschedule and complete through the real adapter — exact times, stable id, events, lead mirror; one open follow-up per lead is enforced by the database", { skip }, async () => {
  const { service, fu, leadPg, schema, db } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("lifecycle");
  const when = new Date(Date.now() + 3 * HOUR);

  const f = await fu.scheduleFollowUp(repos, lead.id, { scheduledAt: when, type: "SITE_VISIT_FOLLOW_UP", note: "show flat" }, FOUNDER);
  assert.equal(f.type, "SITE_VISIT_FOLLOW_UP");
  assert.equal(f.scheduledAt.getTime(), when.getTime());
  assert.equal((await repos.leads.getById(lead.id))?.nextFollowUpAt?.getTime(), when.getTime());

  const later = new Date(when.getTime() + 5 * HOUR);
  const moved = await fu.scheduleFollowUp(repos, lead.id, { scheduledAt: later }, FOUNDER);
  assert.equal(moved.id, f.id, "rescheduled in place");
  assert.equal(moved.rescheduleCount, 1);
  assert.equal(moved.originalScheduledAt.getTime(), when.getTime());

  await assert.rejects(
    db.insert(schema.leadFollowUps).values({ id: randomUUID(), leadId: lead.id, scheduledAt: later, originalScheduledAt: later, createdBy: "x" }),
    "a second open follow-up",
  );
  await fu.completeLeadFollowUp(repos, lead.id, {}, FOUNDER);
  assert.equal((await repos.followUps.getById(f.id))?.status, "COMPLETED");
  const types = (await service.getLeadTimeline(repos, lead.id)).map((e) => e.eventType).filter((t) => t.startsWith("FOLLOW_UP_"));
  assert.deepEqual(types, ["FOLLOW_UP_SET", "FOLLOW_UP_RESCHEDULED", "FOLLOW_UP_COMPLETED"]);
});

test("integration: a miss is recorded EXACTLY once even under concurrent sweeps, dated when it was due", { skip }, async () => {
  const { service, fu, leadPg, staffSvc, notifPg, notifier } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const { staff, member, actor } = await employee("sweeper");
  const lead = await newLead("miss");
  await service.assignLead(repos, staff, lead.id, member.id, FOUNDER);
  const dueAt = new Date(Date.now() + 2 * 1000);
  await fu.scheduleFollowUp(repos, lead.id, { scheduledAt: dueAt }, actor);
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const notificationRepo = notifPg.createPostgresNotificationRepository();
  const lead2notifier = notifier.createLeadNotifier(notificationRepo);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => fu.sweepMissedFollowUps(repos, { leadId: lead.id }, new Date(), lead2notifier)));
  assert.equal(results.flat().length, 1, "exactly one sweep flipped it");

  const events = (await service.getLeadTimeline(repos, lead.id)).filter((e) => e.eventType === "FOLLOW_UP_MISSED");
  assert.equal(events.length, 1);
  assert.equal(events[0].actorType, "SYSTEM");
  assert.equal(events[0].createdAt.getTime(), dueAt.getTime());
  const stored = (await repos.followUps.listByLead(lead.id))[0];
  assert.equal(stored.status, "MISSED");
  assert.equal(stored.missedCount, 1);

  const missedNotes = (await notificationRepo.listForUser(member.userId)).filter((n) => n.type === "FOLLOW_UP_MISSED");
  assert.equal(missedNotes.length, 1, "one notification, in the existing notifications table");
  assert.equal(missedNotes[0].targetRoute, `/team/leads/${lead.id}`);
  assert.ok(!/TEST miss/.test(JSON.stringify(missedNotes[0])), "no buyer name in the notification");
  void staffSvc;
});

test("integration: the restriction and the owner scope on the real database — an employee with a miss can only work that lead; the Founder sees every miss and filters", { skip }, async () => {
  const { service, fu, reads, leadReads, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const one = await employee("restricted");
  const two = await employee("free");
  const missLead = await newLead("has the miss");
  const otherLead = await newLead("other of the same employee");
  const twosLead = await newLead("the other employee's");
  await service.assignLead(repos, one.staff, missLead.id, one.member.id, FOUNDER);
  await service.assignLead(repos, one.staff, otherLead.id, one.member.id, FOUNDER);
  await service.assignLead(repos, two.staff, twosLead.id, two.member.id, FOUNDER);

  const soon = new Date(Date.now() + 1500);
  await fu.scheduleFollowUp(repos, missLead.id, { scheduledAt: soon, type: "CALL_BACK" }, one.actor);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const now = new Date();

  await assert.rejects(service.addNote(repos, otherLead.id, "blocked", one.actor, now), /overdue follow-up/);
  await service.addNote(repos, missLead.id, "allowed: this is the lead to resolve", one.actor, now);
  await service.addNote(repos, twosLead.id, "unaffected", two.actor, now);

  const page = await leadReads.getMyLeadsPage(repos, one.actor, "all", 1, now);
  assert.equal(page.restrictedToMissed, true);
  assert.deepEqual(page.items.map((i) => i.lead.id), [missLead.id]);
  assert.equal((await leadReads.getMyLeadsPage(repos, two.actor, "all", 1, now)).restrictedToMissed, false);

  const mine = await fu.sweepMissedFollowUps(repos, { ownerId: one.member.userId }, now);
  assert.ok(mine.length <= 1);
  const founderView = await reads.getMissedFollowUps(repos, FOUNDER, { ownerId: one.member.userId }, now);
  assert.deepEqual(founderView.map((i) => i.lead.id), [missLead.id]);
  assert.equal((await reads.getMissedFollowUps(repos, FOUNDER, { ownerId: two.member.userId }, now)).length, 0);

  // Resolve by rescheduling: the workspace reopens.
  const open = (await repos.followUps.getOpenByLead(missLead.id))!;
  await fu.rescheduleFollowUp(repos, missLead.id, open.id, { scheduledAt: new Date(Date.now() + 6 * HOUR) }, one.actor);
  assert.equal((await leadReads.getMyLeadsPage(repos, one.actor, "all", 1, new Date())).restrictedToMissed, false);
});

test("integration: returning a lead — ownership clears, history is intact, the Founder's queue shows it with the reason, assigning again clears the state", { skip }, async () => {
  const { service, fu, reads, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const { staff, member, actor } = await employee("returner");
  const lead = await newLead("returned");
  await service.assignLead(repos, staff, lead.id, member.id, FOUNDER);
  await service.logContact(repos, lead.id, { channel: "PHONE_CALL", outcome: "NO_ANSWER" }, actor);
  await fu.scheduleFollowUp(repos, lead.id, { scheduledAt: new Date(Date.now() + 5 * HOUR) }, actor);
  const before = await service.getLeadTimeline(repos, lead.id);

  await fu.returnLeadToFounder(repos, lead.id, "CLIENT_NOT_RESPONDING", undefined, actor);
  const returned = (await repos.leads.getById(lead.id))!;
  assert.equal(returned.ownerId, null);
  assert.equal(returned.returnReason, "CLIENT_NOT_RESPONDING");
  assert.equal(returned.returnedFrom, member.userId);
  const after = await service.getLeadTimeline(repos, lead.id);
  assert.deepEqual(after.slice(0, before.length).map((e) => e.id), before.map((e) => e.id), "earlier history intact and in order");
  assert.deepEqual(after.slice(before.length).map((e) => e.eventType).sort(), ["FOLLOW_UP_CANCELLED", "OWNER_CHANGED", "RETURNED_TO_FOUNDER"]);

  const queue = await reads.getReturnedLeads(repos, FOUNDER);
  const item = queue.find((i) => i.lead.id === lead.id)!;
  assert.equal(item.reason, "CLIENT_NOT_RESPONDING");
  assert.equal(item.contactAttempts, 1);
  assert.equal(item.lastFollowUp?.cancelReason, "RETURNED_TO_FOUNDER");

  await service.assignLead(repos, staff, lead.id, member.id, FOUNDER);
  assert.equal((await repos.leads.getById(lead.id))?.returnedAt, null);
  assert.ok(!(await reads.getReturnedLeads(repos, FOUNDER)).some((i) => i.lead.id === lead.id));
});

test("integration: erasure closes the open follow-up, clears its text, and the lead never appears as missed", { skip }, async () => {
  const { service, fu, reads, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const lead = await newLead("erase");
  await fu.scheduleFollowUp(repos, lead.id, { scheduledAt: new Date(Date.now() + HOUR), note: "ask about the Verma family" }, FOUNDER);
  await service.eraseLead(repos, lead.id, FOUNDER);
  const stored = (await repos.followUps.listByLead(lead.id))[0];
  assert.equal(stored.status, "CANCELLED");
  assert.equal(stored.cancelReason, "LEAD_ERASED");
  assert.equal(stored.note, null);
  assert.ok(!JSON.stringify(await service.getLeadTimeline(repos, lead.id)).includes("Verma"));
  assert.ok(!(await reads.getMissedFollowUps(repos, FOUNDER, {}, new Date(Date.now() + 5 * HOUR))).some((i) => i.lead.id === lead.id));
});

test("integration: the 0020 backfill is well-formed — at most one open follow-up per lead, none for erased leads, every one has an exact time", { skip }, async () => {
  const { db, sql } = await modules();
  const dupes = await db.execute(sql`SELECT lead_id FROM lead_follow_ups WHERE status IN ('SCHEDULED','MISSED') GROUP BY lead_id HAVING count(*) > 1`);
  assert.equal(dupes.rows.length, 0);
  const erased = await db.execute(sql`SELECT f.id FROM lead_follow_ups f JOIN leads l ON l.id = f.lead_id WHERE l.erased_at IS NOT NULL AND f.created_by = 'system:migration-0020' AND f.status IN ('SCHEDULED','MISSED')`);
  assert.equal(erased.rows.length, 0);
  const nulls = await db.execute(sql`SELECT id FROM lead_follow_ups WHERE scheduled_at IS NULL OR original_scheduled_at IS NULL`);
  assert.equal(nulls.rows.length, 0);
});
