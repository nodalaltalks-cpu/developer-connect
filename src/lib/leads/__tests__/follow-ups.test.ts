import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addNote,
  assignLead,
  captureAssistanceLead,
  eraseLead,
  getLeadTimeline,
  logContact,
  setFollowUp,
} from "../lead-service.ts";
import {
  cancelLeadFollowUp,
  completeLeadFollowUp,
  notifyDueFollowUps,
  rescheduleFollowUp,
  returnLeadToFounder,
  scheduleFollowUp,
  sweepMissedFollowUps,
  validateScheduledAt,
  type LeadNotification,
  type LeadNotifier,
} from "../follow-up-service.ts";
import { getFounderAttention, getMissedFollowUps, getMyWorkState, getReturnedLeads } from "../follow-up-reads.ts";
import { getMyLeadDetail, getMyLeadsPage } from "../lead-reads.ts";
import { createRequirement } from "../requirement-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { describeTimeline } from "../timeline.ts";
import { businessLocalToInstant, businessPresetLocal, formatDateTimeFull, formatOverdue } from "../format.ts";
import { redactPayload } from "../redaction.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, MissedFollowUpBlockError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadActor } from "../types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * Follow-up discipline (Phase 2): exact-time follow-ups, the lifecycle, server-side missed detection, the missed-lead
 * restriction and its resolution, returning a lead, call outcomes without comments, notifications, and security — in
 * memory, no database. T0 is 15:30 in India; the Founder's day ends at minutes(510).
 */

function fakeNotifier(options: { failing?: boolean } = {}) {
  const sent: LeadNotification[] = [];
  const notifier: LeadNotifier = {
    async notify(notification) {
      if (options.failing) throw new Error("notification store is down");
      sent.push(notification);
    },
  };
  return { sent, notifier };
}

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3400 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, a2, b, c] = [await mk(1), await mk(2), await mk(3), await mk(4)];
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, a2.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(5));
  const priyaActor = (await resolveEmployee(staff, priya.userId))!.actor;
  const rohanActor = (await resolveEmployee(staff, rohan.userId))!.actor;
  return { repos, staff, priya, rohan, a, a2, b, c, priyaActor, rohanActor };
}
type World = Awaited<ReturnType<typeof world>>;

const eventTypes = async (repos: World["repos"], leadId: string) => (await getLeadTimeline(repos, leadId)).map((e) => e.eventType);

/** Priya schedules on `a` at minutes(60) and the clock moves past it, leaving one unresolved miss. */
async function withMiss(w: World) {
  const followUp = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60), type: "CALL_BACK" }, w.priyaActor, minutes(10));
  return { followUp, now: minutes(60 + 138) }; // missed by 2h 18m
}

// --- scheduling -----------------------------------------------------------------------------------

test("schedule: an exact time, a type, a stable id, the actor and the creation time are recorded; the lead summary mirrors the time", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(120), type: "SITE_VISIT_FOLLOW_UP", note: "show the sample flat" }, w.priyaActor, minutes(10));
  assert.equal(f.status, "SCHEDULED");
  assert.equal(f.type, "SITE_VISIT_FOLLOW_UP");
  assert.equal(f.scheduledAt.getTime(), minutes(120).getTime());
  assert.equal(f.createdBy, w.priya.userId);
  assert.equal(f.createdAt.getTime(), minutes(10).getTime());
  assert.equal(f.ownerId, w.priya.userId);
  assert.match(f.id, /^[0-9a-f-]{36}$/);
  assert.equal((await w.repos.leads.getById(w.a.id))?.nextFollowUpAt?.getTime(), minutes(120).getTime());
  const [event] = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "FOLLOW_UP_SET");
  assert.deepEqual(event.payload, { followUpId: f.id, followUpType: "SITE_VISIT_FOLLOW_UP", dueAt: minutes(120).toISOString(), note: "show the sample flat" });
  assert.equal(event.actorId, w.priya.userId);
});

test("schedule: the default type is GENERAL; a bad type, a past or invalid time, a non-Date and an overlong note are refused", async () => {
  const w = await world();
  assert.equal((await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(100) }, w.priyaActor, minutes(10))).type, "GENERAL_FOLLOW_UP");
  const bad = [
    { scheduledAt: minutes(100), type: "COFFEE" as never },
    { scheduledAt: minutes(10) },
    { scheduledAt: minutes(5) },
    { scheduledAt: new Date("nonsense") },
    { scheduledAt: "2026-10-12" as never },
    { scheduledAt: undefined as never },
    { scheduledAt: new Date(minutes(10).getTime() + 400 * 86_400_000) },
    { scheduledAt: minutes(100), note: "x".repeat(501) },
  ];
  for (const input of bad) await assert.rejects(scheduleFollowUp(w.repos, w.a2.id, input, w.priyaActor, minutes(10)), LeadValidationError, JSON.stringify(input).slice(0, 60));
  assert.equal((await w.repos.followUps.listByLead(w.a2.id)).length, 0, "nothing invalid was stored");
  assert.throws(() => validateScheduledAt(minutes(10), minutes(10)), LeadValidationError, "exactly now is not the future");
});

test("schedule: scheduling again reschedules the SAME follow-up (same id, counted, previous time kept in the event); the same time is refused", async () => {
  const w = await world();
  const first = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(100) }, w.priyaActor, minutes(10));
  const second = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(200), type: "CALL_BACK" }, w.priyaActor, minutes(20));
  assert.equal(second.id, first.id);
  assert.equal(second.rescheduleCount, 1);
  assert.equal(second.type, "CALL_BACK");
  assert.equal(second.originalScheduledAt.getTime(), minutes(100).getTime(), "the original time is never lost");
  const [event] = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "FOLLOW_UP_RESCHEDULED");
  assert.equal(event.payload.from, minutes(100).toISOString());
  assert.equal(event.payload.to, minutes(200).toISOString());
  assert.equal(event.payload.wasMissed, false);
  await assert.rejects(scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(200), type: "CALL_BACK" }, w.priyaActor, minutes(30)), LeadStateError);
  assert.equal((await w.repos.followUps.listByLead(w.a.id)).length, 1, "one follow-up, rescheduled — never two open");
});

test("the database-level promise holds in memory too: a second OPEN follow-up on one lead cannot be created", async () => {
  const w = await world();
  await w.repos.followUps.create({ leadId: w.a.id, type: "CALL_BACK", scheduledAt: minutes(100), ownerId: w.priya.userId, note: null, createdBy: "x", now: minutes(10) });
  await assert.rejects(w.repos.followUps.create({ leadId: w.a.id, type: "CALL_BACK", scheduledAt: minutes(200), ownerId: w.priya.userId, note: null, createdBy: "x", now: minutes(10) }), LeadStateError);
});

// --- missed detection -----------------------------------------------------------------------------

test("missed: the SERVER decides — scheduled_at < now while still SCHEDULED; the sweep records it once, dated when it was due", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  assert.deepEqual(await sweepMissedFollowUps(w.repos, {}, minutes(59)), [], "not yet due");
  const swept = await sweepMissedFollowUps(w.repos, {}, minutes(61));
  assert.deepEqual(swept.map((x) => x.id), [f.id]);
  const stored = (await w.repos.followUps.getById(f.id))!;
  assert.equal(stored.status, "MISSED");
  assert.equal(stored.missedCount, 1);
  assert.equal(stored.lastMissedAt?.getTime(), minutes(61).getTime());

  const missedEvents = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "FOLLOW_UP_MISSED");
  assert.equal(missedEvents.length, 1);
  assert.equal(missedEvents[0].actorType, "SYSTEM");
  assert.equal(missedEvents[0].createdAt.getTime(), minutes(60).getTime(), "dated at the moment it was due, not when noticed");
  assert.equal(missedEvents[0].payload.detectedAt, minutes(61).toISOString());

  assert.deepEqual(await sweepMissedFollowUps(w.repos, {}, minutes(500)), [], "idempotent: swept again, nothing changes");
  assert.equal((await eventTypes(w.repos, w.a.id)).filter((t) => t === "FOLLOW_UP_MISSED").length, 1, "one real miss is one event");
});

test("missed: an overdue follow-up is found even if no sweep has run yet, and erased or future ones never are", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  await scheduleFollowUp(w.repos, w.a2.id, { scheduledAt: minutes(400) }, w.priyaActor, minutes(10));
  const rows = await w.repos.followUps.listUnresolvedMissed({ now: minutes(100), limit: 10 });
  assert.deepEqual(rows.map((r) => r.lead.id), [w.a.id]);
});

test("missed: a concurrent double sweep still records ONE miss (atomic claim)", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const { sent, notifier } = fakeNotifier();
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => sweepMissedFollowUps(w.repos, {}, minutes(70), notifier)));
  assert.equal(results.flat().length, 1);
  assert.equal((await eventTypes(w.repos, w.a.id)).filter((t) => t === "FOLLOW_UP_MISSED").length, 1);
  assert.equal(sent.length, 1, "and one notification");
});

test("missed: employee visibility is their own only; Founder sees everyone's with employee, temperature, status, date and overdue filters", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  await scheduleFollowUp(w.repos, w.b.id, { scheduledAt: minutes(120) }, w.rohanActor, minutes(10));
  await w.repos.leads.update(w.a.id, { temperature: "HOT" }, minutes(11));
  const now = minutes(300);

  const mine = await getMissedFollowUps(w.repos, w.priyaActor, { ownerId: w.rohan.userId, temperature: "COLD" }, now);
  assert.deepEqual(mine.map((i) => i.lead.id), [w.a.id], "an employee's own, whatever filters they pass");
  const all = await getMissedFollowUps(w.repos, FOUNDER, {}, now);
  assert.deepEqual(all.map((i) => i.lead.id), [w.a.id, w.b.id], "oldest miss first");
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { ownerId: w.rohan.userId }, now)).map((i) => i.lead.id), [w.b.id]);
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { temperature: "HOT" }, now)).map((i) => i.lead.id), [w.a.id]);
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { status: "NEW" }, now)).length, 2);
  // a was due 240 minutes before `now`, b 180: "overdue by at least" is inclusive of the boundary.
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { minOverdueMs: 4 * 3_600_000 }, now)).map((i) => i.lead.id), [w.a.id]);
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { minOverdueMs: 5 * 3_600_000 }, now)).length, 0);
  assert.deepEqual((await getMissedFollowUps(w.repos, FOUNDER, { from: minutes(100) }, now)).map((i) => i.lead.id), [w.b.id], "scheduled on or after a date");
  const item = all[0];
  assert.equal(item.overdueMs, (300 - 60) * 60_000);
  assert.equal(item.followUp.type, "GENERAL_FOLLOW_UP");
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor]) await assert.rejects(getMissedFollowUps(w.repos, actor, {}, now), UnauthorizedLeadActionError);
});

// --- the restriction ------------------------------------------------------------------------------

test("restriction: with an unresolved miss an employee can only work the lead that has it — every other operation is refused server-side", async () => {
  const w = await world();
  const { now } = await withMiss(w);
  const refuse = (p: Promise<unknown>) => assert.rejects(p, MissedFollowUpBlockError);

  await refuse(addNote(w.repos, w.a2.id, "x", w.priyaActor, now));
  await refuse(logContact(w.repos, w.a2.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, w.priyaActor, now));
  await refuse(scheduleFollowUp(w.repos, w.a2.id, { scheduledAt: minutes(500) }, w.priyaActor, now));
  await refuse(createRequirement(w.repos, w.a2.id, { locations: ["Thane"] }, w.priyaActor, now));
  await refuse(returnLeadToFounder(w.repos, w.a2.id, "WRONG_NUMBER", undefined, w.priyaActor, now));
  assert.equal((await eventTypes(w.repos, w.a2.id)).filter((t) => t === "NOTE_ADDED" || t === "CONTACT_LOGGED").length, 0, "nothing was written");

  // The lead WITH the miss stays workable (that is how it gets resolved), and others are untouched.
  await addNote(w.repos, w.a.id, "trying again", w.priyaActor, now);
  await addNote(w.repos, w.b.id, "rohan is free", w.rohanActor, now);
  await addNote(w.repos, w.c.id, "founder is never blocked", FOUNDER, now).catch(() => undefined);
  assert.ok((await eventTypes(w.repos, w.b.id)).includes("NOTE_ADDED"));
});

test("restriction: the lists and the detail are limited the same way — only leads with a miss can be listed or opened", async () => {
  const w = await world();
  const { now } = await withMiss(w);
  const page = await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now);
  assert.equal(page.restrictedToMissed, true);
  assert.deepEqual(page.items.map((i) => i.lead.id), [w.a.id], "the other lead is not even listed, whatever view is asked for");
  assert.deepEqual((await getMyLeadsPage(w.repos, w.priyaActor, "new", 1, now)).items.map((i) => i.lead.id), [w.a.id]);
  assert.ok(await getMyLeadDetail(w.repos, w.priyaActor, w.a.id, now));
  await assert.rejects(getMyLeadDetail(w.repos, w.priyaActor, w.a2.id, now), MissedFollowUpBlockError);
  // Rohan has no misses: unaffected.
  assert.equal((await getMyLeadsPage(w.repos, w.rohanActor, "all", 1, now)).restrictedToMissed, false);
});

test("restriction: nothing is blocked before the follow-up's time passes, and the Founder is never blocked", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  await addNote(w.repos, w.a2.id, "fine, not yet due", w.priyaActor, minutes(30));
  const after = minutes(200);
  await addNote(w.repos, w.a2.id, "founder works any lead", FOUNDER, after);
  assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, minutes(30))).restrictedToMissed, false);
});

// --- resolution -----------------------------------------------------------------------------------

test("resolve: COMPLETE NOW marks it done (late, recorded), clears the miss and reopens the workspace", async () => {
  const w = await world();
  const { followUp, now } = await withMiss(w);
  const done = await completeLeadFollowUp(w.repos, w.a.id, { followUpId: followUp.id }, w.priyaActor, now);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.completedBy, w.priya.userId);
  assert.equal(done.completedAt?.getTime(), now.getTime());
  const events = await getLeadTimeline(w.repos, w.a.id);
  const completed = events.find((e) => e.eventType === "FOLLOW_UP_COMPLETED")!;
  assert.equal(completed.payload.late, true);
  assert.ok(events.some((e) => e.eventType === "FOLLOW_UP_MISSED"), "the miss itself stays in the history");
  assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now)).restrictedToMissed, false);
  assert.equal((await w.repos.leads.getById(w.a.id))?.nextFollowUpAt, null);
});

test("resolve: RESCHEDULE puts it back to SCHEDULED at a new exact time (previous time and 'was missed' recorded) and reopens the workspace", async () => {
  const w = await world();
  const { followUp, now } = await withMiss(w);
  const moved = await rescheduleFollowUp(w.repos, w.a.id, followUp.id, { scheduledAt: minutes(500) }, w.priyaActor, now);
  assert.equal(moved.status, "SCHEDULED");
  assert.equal(moved.scheduledAt.getTime(), minutes(500).getTime());
  assert.equal(moved.missedCount, 1, "it stays on the record that it was missed once");
  const event = (await getLeadTimeline(w.repos, w.a.id)).find((e) => e.eventType === "FOLLOW_UP_RESCHEDULED")!;
  assert.equal(event.payload.from, minutes(60).toISOString());
  assert.equal(event.payload.to, minutes(500).toISOString());
  assert.equal(event.payload.wasMissed, true);
  assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now)).restrictedToMissed, false);
  await assert.rejects(rescheduleFollowUp(w.repos, w.a.id, followUp.id, { scheduledAt: minutes(100) }, w.priyaActor, now), LeadValidationError, "a rescheduled time must be in the future");
});

test("resolve: CANCEL needs a structured reason (the note is optional); an unknown reason is refused", async () => {
  const w = await world();
  const { followUp, now } = await withMiss(w);
  for (const reason of [undefined, "", "BORED", 7] as never[]) {
    await assert.rejects(cancelLeadFollowUp(w.repos, w.a.id, followUp.id, reason, undefined, w.priyaActor, now), LeadValidationError);
  }
  assert.equal((await w.repos.followUps.listUnresolvedMissed({ now, limit: 10 })).length, 1, "still unresolved after every refusal");
  const cancelled = await cancelLeadFollowUp(w.repos, w.a.id, followUp.id, "CLIENT_NOT_RESPONDING", undefined, w.priyaActor, now);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.cancelReason, "CLIENT_NOT_RESPONDING");
  assert.equal(cancelled.cancelledBy, w.priya.userId);
  const event = (await getLeadTimeline(w.repos, w.a.id)).find((e) => e.eventType === "FOLLOW_UP_CANCELLED")!;
  assert.deepEqual(event.payload, { followUpId: followUp.id, reason: "CLIENT_NOT_RESPONDING" });
  assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now)).restrictedToMissed, false);
});

test("resolve: RETURN LEAD resolves the miss too (the follow-up is closed as RETURNED_TO_FOUNDER) and the lead leaves the employee", async () => {
  const w = await world();
  const { followUp, now } = await withMiss(w);
  await returnLeadToFounder(w.repos, w.a.id, "CLIENT_NOT_RESPONDING", undefined, w.priyaActor, now);
  const stored = (await w.repos.followUps.getById(followUp.id))!;
  assert.equal(stored.status, "CANCELLED");
  assert.equal(stored.cancelReason, "RETURNED_TO_FOUNDER");
  assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now)).restrictedToMissed, false);
  assert.equal(await getMyLeadDetail(w.repos, w.priyaActor, w.a.id, now), null, "no longer theirs");
});

test("resolve: it cannot be dismissed — there is no operation that clears a miss without one of the four resolutions", async () => {
  const w = await world();
  const { followUp, now } = await withMiss(w);
  // The reason-less clear is Founder-only; an employee has only the cancel path, which demands a reason.
  await assert.rejects(setFollowUp(w.repos, w.a.id, null, w.priyaActor, now), UnauthorizedLeadActionError);
  assert.equal((await w.repos.followUps.listUnresolvedMissed({ now, limit: 10 })).length, 1, "the miss is still there");
  assert.equal((await w.repos.followUps.getById(followUp.id))?.cancelReason, null);
});

test("founder override: the Founder can complete, reschedule or cancel any employee's missed follow-up — attributed to the Founder", async () => {
  for (const resolve of ["complete", "reschedule", "cancel"] as const) {
    const w = await world();
    const { followUp, now } = await withMiss(w);
    if (resolve === "complete") await completeLeadFollowUp(w.repos, w.a.id, { followUpId: followUp.id }, FOUNDER, now);
    if (resolve === "reschedule") await rescheduleFollowUp(w.repos, w.a.id, followUp.id, { scheduledAt: minutes(900) }, FOUNDER, now);
    if (resolve === "cancel") await cancelLeadFollowUp(w.repos, w.a.id, followUp.id, "NOT_INTERESTED", "founder decided", FOUNDER, now);
    const last = (await getLeadTimeline(w.repos, w.a.id)).at(-1)!;
    assert.equal(last.actorType, "FOUNDER", resolve);
    assert.equal(last.actorId, FOUNDER.actorId);
    assert.equal((await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, now)).restrictedToMissed, false, `${resolve}: Priya is free again`);
  }
});

// --- returning a lead -----------------------------------------------------------------------------

test("return: the reason is mandatory and structured; an unknown one is refused and nothing changes", async () => {
  const w = await world();
  const before = JSON.stringify(await getLeadTimeline(w.repos, w.a.id));
  for (const reason of [undefined, "", "BECAUSE", 1] as never[]) {
    await assert.rejects(returnLeadToFounder(w.repos, w.a.id, reason, undefined, w.priyaActor, minutes(20)), LeadValidationError);
  }
  assert.equal(JSON.stringify(await getLeadTimeline(w.repos, w.a.id)), before);
  assert.equal((await w.repos.leads.getById(w.a.id))?.ownerId, w.priya.userId);
});

test("return: ownership goes to the Founder queue, both events carry who/previous/new/when/why, and the whole earlier history and requirement are untouched", async () => {
  const w = await world();
  await addNote(w.repos, w.a.id, "spoke to the client", w.priyaActor, minutes(20));
  await logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome: "NO_ANSWER" }, w.priyaActor, minutes(21));
  const req = await createRequirement(w.repos, w.a.id, { locations: ["Thane"], configuration: "2 BHK" }, w.priyaActor, minutes(22));
  const before = await getLeadTimeline(w.repos, w.a.id);
  const createdAt = (await w.repos.leads.getById(w.a.id))!.createdAt;

  const returned = await returnLeadToFounder(w.repos, w.a.id, "OTHER", "client travelling for a month", w.priyaActor, minutes(30));
  assert.equal(returned.ownerId, null);
  assert.equal(returned.returnedAt?.getTime(), minutes(30).getTime());
  assert.equal(returned.returnedFrom, w.priya.userId);
  assert.equal(returned.returnReason, "OTHER");
  assert.equal(returned.createdAt.getTime(), createdAt.getTime(), "historical timestamps are not reset");

  const after = await getLeadTimeline(w.repos, w.a.id);
  assert.deepEqual(after.slice(0, before.length), before, "every earlier event is still there, in order");
  const [owner, ret] = after.slice(before.length);
  assert.equal(owner.eventType, "OWNER_CHANGED");
  assert.deepEqual(owner.payload, { from: w.priya.userId, to: null, via: "RETURN" });
  assert.equal(ret.eventType, "RETURNED_TO_FOUNDER");
  assert.deepEqual(ret.payload, { reason: "OTHER", previousOwnerId: w.priya.userId, note: "client travelling for a month" });
  for (const e of [owner, ret]) {
    assert.equal(e.actorType, "EMPLOYEE");
    assert.equal(e.actorId, w.priya.userId);
    assert.equal(e.createdAt.getTime(), minutes(30).getTime());
  }
  assert.equal((await w.repos.requirements.getById(req.id))?.status, "ACTIVE", "the buyer requirement is untouched");
});

test("return: the Founder's Returned Leads queue shows why, who, when, the last contact attempt, last follow-up, status, temperature and requirement", async () => {
  const w = await world();
  await createRequirement(w.repos, w.a.id, { locations: ["Thane"], configuration: "2 BHK", budgetMax: 9_000_000, budgetCurrency: "INR" }, w.priyaActor, minutes(15));
  await logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome: "SWITCHED_OFF" }, w.priyaActor, minutes(20));
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(100), type: "CALL_BACK" }, w.priyaActor, minutes(21));
  await w.repos.leads.update(w.a.id, { temperature: "HOT" }, minutes(22));
  await returnLeadToFounder(w.repos, w.a.id, "CLIENT_NOT_RESPONDING", undefined, w.priyaActor, minutes(30));

  const [item] = await getReturnedLeads(w.repos, FOUNDER);
  assert.equal(item.lead.id, w.a.id);
  assert.equal(item.returnedBy, w.priya.userId);
  assert.equal(item.reason, "CLIENT_NOT_RESPONDING");
  assert.equal(item.returnedAt.getTime(), minutes(30).getTime());
  assert.equal(item.lastContactAt?.getTime(), minutes(20).getTime());
  assert.equal(item.contactAttempts, 1);
  assert.equal(item.lastFollowUp?.type, "CALL_BACK");
  assert.equal(item.lastFollowUp?.status, "CANCELLED");
  assert.equal(item.lead.status, "NEW");
  assert.equal(item.lead.temperature, "HOT");
  assert.match(item.requirement ?? "", /2 BHK/);
  assert.match(item.requirement ?? "", /Thane/);
  assert.equal(item.note, null);
  const attention = await getFounderAttention(w.repos, FOUNDER, minutes(40));
  assert.equal(attention.returned, 1);
});

test("return: who may — only the owning employee; not another employee, not the Founder (who reassigns), not buyers; and an assign clears the returned state but keeps the history", async () => {
  const w = await world();
  await assert.rejects(returnLeadToFounder(w.repos, w.a.id, "OTHER", undefined, w.rohanActor, minutes(20)), LeadNotFoundError, "someone else's lead");
  await assert.rejects(returnLeadToFounder(w.repos, w.c.id, "OTHER", undefined, w.priyaActor, minutes(20)), LeadNotFoundError, "an unassigned lead");
  for (const actor of [FOUNDER, BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor]) {
    await assert.rejects(returnLeadToFounder(w.repos, w.a.id, "OTHER", undefined, actor, minutes(20)), UnauthorizedLeadActionError);
  }
  assert.equal((await w.repos.leads.getById(w.a.id))?.ownerId, w.priya.userId);

  await returnLeadToFounder(w.repos, w.a.id, "TIMING_NOT_RIGHT", undefined, w.priyaActor, minutes(30));
  await assignLead(w.repos, w.staff, w.a.id, w.rohan.id, FOUNDER, minutes(40));
  const lead = (await w.repos.leads.getById(w.a.id))!;
  assert.equal(lead.ownerId, w.rohan.userId);
  assert.equal(lead.returnedAt, null);
  assert.deepEqual(await getReturnedLeads(w.repos, FOUNDER), []);
  assert.ok((await eventTypes(w.repos, w.a.id)).includes("RETURNED_TO_FOUNDER"), "the return stays in the history");
  await assert.rejects(getReturnedLeads(w.repos, w.priyaActor), UnauthorizedLeadActionError);
});

test("reassign: the previous owner's open follow-up is closed (REASSIGNED) and stays in the history", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  await assignLead(w.repos, w.staff, w.a.id, w.rohan.id, FOUNDER, minutes(100));
  const stored = (await w.repos.followUps.getById(f.id))!;
  assert.equal(stored.status, "CANCELLED");
  assert.equal(stored.cancelReason, "REASSIGNED");
  assert.equal(stored.missedCount, 1, "its miss is on the record");
  assert.equal((await w.repos.followUps.getOpenByLead(w.a.id)), null);
});

// --- call outcomes, timestamps, timeline ---------------------------------------------------------

test("calls: an outcome alone records a call — no comment, a server timestamp, the actor — and every outcome the dialer flow offers is accepted", async () => {
  const w = await world();
  const outcomes = ["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "INVALID_NUMBER", "CALLBACK_REQUESTED"] as const;
  let minute = 20;
  for (const outcome of outcomes) await logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome }, w.priyaActor, minutes(minute++));
  const calls = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CONTACT_LOGGED");
  assert.equal(calls.length, outcomes.length);
  assert.deepEqual(calls.map((e) => e.payload.outcome), [...outcomes]);
  for (const [i, call] of calls.entries()) {
    assert.ok(!("note" in call.payload), "no comment was needed or stored");
    assert.equal(call.createdAt.getTime(), minutes(20 + i).getTime(), "the server's timestamp, never typed");
    assert.equal(call.actorId, w.priya.userId);
  }
  const lines = describeTimeline(calls, { [w.priya.userId]: "Priya Nair" });
  assert.equal(lines[0].headline, "Call attempted — Connected");
  assert.equal(lines[3].headline, "Call attempted — Switched off");
  assert.equal(lines[0].by, "Priya Nair");
  await assert.rejects(logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome: "MAYBE" as never }, w.priyaActor), LeadValidationError);
});

test("timeline: chronological, with exact dates and times — a backdated MISSED event sits where it belongs, and every line says who", async () => {
  const w = await world();
  await logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome: "NO_ANSWER" }, w.priyaActor, minutes(20));
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60), type: "CALL_BACK" }, w.priyaActor, minutes(25));
  await sweepMissedFollowUps(w.repos, {}, minutes(120));
  await rescheduleFollowUp(w.repos, w.a.id, (await w.repos.followUps.getOpenByLead(w.a.id))!.id, { scheduledAt: minutes(300) }, w.priyaActor, minutes(127));
  await logContact(w.repos, w.a.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, w.priyaActor, minutes(305));
  await returnLeadToFounder(w.repos, w.a.id, "NEEDS_REASSIGNMENT", undefined, w.priyaActor, minutes(310));

  const events = await getLeadTimeline(w.repos, w.a.id);
  const times = events.map((e) => e.createdAt.getTime());
  assert.deepEqual([...times].sort((x, y) => x - y), times, "strictly chronological");
  const lines = describeTimeline(events, { [w.priya.userId]: "Priya Nair" }).map((l) => l.headline);
  const at = (needle: string) => lines.findIndex((l) => l.startsWith(needle));
  assert.ok(at("Call attempted — No answer") < at("Follow-up scheduled") && at("Follow-up scheduled") < at("Follow-up missed") && at("Follow-up missed") < at("Follow-up rescheduled"));
  assert.ok(at("Follow-up rescheduled") < at("Call attempted — Connected") && at("Call attempted — Connected") < at("Returned to Founder — Needs reassignment"));
  assert.match(lines[at("Follow-up scheduled")], /Follow-up scheduled — 05 Oct 2026, 04:30 PM \(Call back\)/, "exact date and time, India time, with its type");
  assert.match(lines[at("Follow-up missed")], /was due 05 Oct 2026, 04:30 PM/);
});

test("time: formatting and parsing are explicit about the business zone (India), never the server's or the browser's", () => {
  const instant = new Date("2026-10-12T10:00:00.000Z");
  assert.equal(formatDateTimeFull(instant), "12 Oct 2026, 03:30 PM");
  assert.equal(formatDateTimeFull(instant, "UTC"), "12 Oct 2026, 10:00 AM");
  assert.equal(businessLocalToInstant("2026-10-12T15:30")?.toISOString(), "2026-10-12T10:00:00.000Z");
  assert.equal(businessLocalToInstant("2026-01-01T00:05")?.toISOString(), "2025-12-31T18:35:00.000Z");
  for (const bad of ["2026-10-12", "2026-10-12T15", "12/10/2026 3:30pm", "2026-13-40T10:00", "2026-02-30T10:00", "", "nonsense"]) assert.equal(businessLocalToInstant(bad), null, bad);
  assert.equal(businessLocalToInstant(undefined as never), null);
  assert.equal(businessPresetLocal(new Date("2026-10-05T10:00:00.000Z"), 1), "2026-10-06T10:00");
  assert.equal(formatOverdue(138 * 60_000), "2h 18m");
  assert.equal(formatOverdue(30_000), "under a minute");
  assert.equal(formatOverdue(26 * 3_600_000), "1d 2h");
});

// --- notifications --------------------------------------------------------------------------------

test("notifications: missed follow-up → the owner, once, linking to the lead, with no buyer name or number in the text", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const { sent, notifier } = fakeNotifier();
  await sweepMissedFollowUps(w.repos, {}, minutes(70), notifier);
  await sweepMissedFollowUps(w.repos, {}, minutes(80), notifier);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, w.priya.userId);
  assert.equal(sent[0].type, "FOLLOW_UP_MISSED");
  assert.equal(sent[0].targetRoute, `/team/leads/${w.a.id}`);
  assert.doesNotMatch(JSON.stringify(sent[0]), /Buyer 1|98765|asha/i);
});

test("notifications: 'due soon' is sent once, 15 minutes ahead, to the owning employee only", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  await scheduleFollowUp(w.repos, w.b.id, { scheduledAt: minutes(300) }, w.rohanActor, minutes(10));
  const { sent, notifier } = fakeNotifier();
  await notifyDueFollowUps(w.repos, {}, minutes(30), notifier);
  assert.equal(sent.length, 0, "not within 15 minutes yet");
  await notifyDueFollowUps(w.repos, {}, minutes(50), notifier);
  await notifyDueFollowUps(w.repos, {}, minutes(55), notifier);
  assert.equal(sent.length, 1, "once per scheduled time");
  assert.equal(sent[0].type, "FOLLOW_UP_DUE");
  assert.equal(sent[0].userId, w.priya.userId);
  // Rescheduling re-arms it.
  await rescheduleFollowUp(w.repos, w.a.id, (await w.repos.followUps.getOpenByLead(w.a.id))!.id, { scheduledAt: minutes(200) }, w.priyaActor, minutes(56));
  await notifyDueFollowUps(w.repos, {}, minutes(190), notifier);
  assert.equal(sent.length, 2);
});

test("notifications: assignment tells the assignee; a return tells the Founder who assigned the lead; a failing notifier never undoes or blocks the work", async () => {
  const w = await world();
  const { sent, notifier } = fakeNotifier();
  await assignLead(w.repos, w.staff, w.c.id, w.priya.id, FOUNDER, minutes(8), notifier);
  assert.deepEqual(sent.map((n) => [n.userId, n.type, n.targetRoute]), [[w.priya.userId, "LEAD_ASSIGNED", `/team/leads/${w.c.id}`]]);

  await returnLeadToFounder(w.repos, w.c.id, "WRONG_NUMBER", undefined, w.priyaActor, minutes(20), notifier);
  const returned = sent.at(-1)!;
  assert.equal(returned.userId, FOUNDER.actorId, "the Founder who assigned it");
  assert.equal(returned.type, "LEAD_RETURNED");
  assert.equal(returned.targetRoute, "/admin/returned-leads");

  const failing = fakeNotifier({ failing: true });
  await assignLead(w.repos, w.staff, w.c.id, w.rohan.id, FOUNDER, minutes(30), failing.notifier);
  assert.equal((await w.repos.leads.getById(w.c.id))?.ownerId, w.rohan.userId, "the assignment stood");
  await scheduleFollowUp(w.repos, w.b.id, { scheduledAt: minutes(60) }, w.rohanActor, minutes(31));
  assert.equal((await sweepMissedFollowUps(w.repos, {}, minutes(90), failing.notifier)).length, 1, "the miss was recorded");
});

// --- priority, work queue, security --------------------------------------------------------------

test("what to do now: missed first, then calls due within 15 minutes, then the rest of today — scoped to the employee", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const empty = await getMyWorkState(w.repos, w.priyaActor, minutes(30));
  assert.equal(empty.blocked, false);
  assert.deepEqual(empty.dueNow.map((i) => i.lead.id), []);
  assert.deepEqual(empty.dueToday.map((i) => i.lead.id), [w.a.id]);

  const soon = await getMyWorkState(w.repos, w.priyaActor, minutes(50));
  assert.deepEqual(soon.dueNow.map((i) => i.lead.id), [w.a.id], "due within 15 minutes");
  assert.deepEqual(soon.dueToday.map((i) => i.lead.id), []);

  const { sent, notifier } = fakeNotifier();
  const late = await getMyWorkState(w.repos, w.priyaActor, minutes(90), notifier);
  assert.equal(late.blocked, true);
  assert.deepEqual(late.missed.map((i) => i.lead.id), [w.a.id]);
  assert.equal(late.missed[0].overdueMs, 30 * 60_000);
  assert.ok(sent.some((n) => n.type === "FOLLOW_UP_MISSED"));
  assert.equal((await getMyWorkState(w.repos, w.rohanActor, minutes(90))).blocked, false, "another employee's miss is not mine");
  for (const actor of [FOUNDER, BUYER, SYSTEM]) await assert.rejects(getMyWorkState(w.repos, actor, minutes(90)), UnauthorizedLeadActionError);
});

test("IDOR: a follow-up id from another lead is unusable for reschedule, complete and cancel — for the owner of the other lead and for the Founder alike", async () => {
  const w = await world();
  const mine = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const his = await scheduleFollowUp(w.repos, w.b.id, { scheduledAt: minutes(70) }, w.rohanActor, minutes(10));
  // Priya owns lead a but passes Rohan's follow-up id.
  await assert.rejects(rescheduleFollowUp(w.repos, w.a.id, his.id, { scheduledAt: minutes(300) }, w.priyaActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(completeLeadFollowUp(w.repos, w.a.id, { followUpId: his.id }, w.priyaActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(cancelLeadFollowUp(w.repos, w.a.id, his.id, "OTHER", undefined, w.priyaActor, minutes(20)), LeadNotFoundError);
  // The Founder cannot cross leads either.
  await assert.rejects(completeLeadFollowUp(w.repos, w.b.id, { followUpId: mine.id }, FOUNDER, minutes(20)), LeadNotFoundError);
  // Rohan cannot touch Priya's lead at all.
  await assert.rejects(rescheduleFollowUp(w.repos, w.a.id, mine.id, { scheduledAt: minutes(300) }, w.rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(completeLeadFollowUp(w.repos, w.a.id, {}, w.rohanActor, minutes(20)), LeadNotFoundError);
  assert.equal((await w.repos.followUps.getById(mine.id))?.status, "SCHEDULED");
  assert.equal((await w.repos.followUps.getById(his.id))?.status, "SCHEDULED");
});

test("security: buyers, system and id-less actors cannot touch follow-ups; an employee cannot sweep or read the Founder's views", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(100) }, actor, minutes(20)), UnauthorizedLeadActionError);
    await assert.rejects(rescheduleFollowUp(w.repos, w.a.id, f.id, { scheduledAt: minutes(100) }, actor, minutes(20)), UnauthorizedLeadActionError);
    await assert.rejects(completeLeadFollowUp(w.repos, w.a.id, {}, actor, minutes(20)), UnauthorizedLeadActionError);
    await assert.rejects(cancelLeadFollowUp(w.repos, w.a.id, f.id, "OTHER", undefined, actor, minutes(20)), UnauthorizedLeadActionError);
  }
  await assert.rejects(getFounderAttention(w.repos, w.priyaActor), UnauthorizedLeadActionError);
  assert.equal((await w.repos.followUps.getById(f.id))?.status, "SCHEDULED");
});

test("history: follow-up events are append-only — nothing earlier ever changes as the follow-up moves through its lifecycle", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const snapshots: string[] = [];
  const steps: Array<() => Promise<unknown>> = [
    () => sweepMissedFollowUps(w.repos, {}, minutes(80)),
    () => rescheduleFollowUp(w.repos, w.a.id, f.id, { scheduledAt: minutes(400) }, w.priyaActor, minutes(90)),
    () => completeLeadFollowUp(w.repos, w.a.id, { followUpId: f.id }, w.priyaActor, minutes(100)),
  ];
  for (const step of steps) {
    const before = await getLeadTimeline(w.repos, w.a.id);
    snapshots.push(JSON.stringify(before));
    await step();
    const after = await getLeadTimeline(w.repos, w.a.id);
    assert.ok(after.length > before.length);
    for (const e of before) assert.deepEqual(after.find((x) => x.id === e.id), e, "an earlier event was changed");
  }
});

test("erased lead: its open follow-up is closed (LEAD_ERASED), free text is cleared, it never shows as missed, and no event keeps a note", async () => {
  const w = await world();
  const f = await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60), note: "ask about the Verma family" }, w.priyaActor, minutes(10));
  await sweepMissedFollowUps(w.repos, {}, minutes(70));
  await eraseLead(w.repos, w.a.id, FOUNDER, minutes(80));

  const stored = (await w.repos.followUps.getById(f.id))!;
  assert.equal(stored.status, "CANCELLED");
  assert.equal(stored.cancelReason, "LEAD_ERASED");
  assert.equal(stored.note, null);
  assert.deepEqual(await getMissedFollowUps(w.repos, FOUNDER, {}, minutes(500)), []);
  assert.deepEqual(await sweepMissedFollowUps(w.repos, {}, minutes(500)), []);
  assert.ok(!JSON.stringify(await getLeadTimeline(w.repos, w.a.id)).includes("Verma"));
  await assert.rejects(scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(900) }, FOUNDER, minutes(100)), LeadStateError);
  await assert.rejects(returnLeadToFounder(w.repos, w.a.id, "OTHER", undefined, w.priyaActor, minutes(100)), LeadNotFoundError);
});

test("redaction: the follow-up and return events keep ids, enums and times only — the notes are dropped", () => {
  assert.deepEqual(redactPayload("RETURNED_TO_FOUNDER", { reason: "OTHER", previousOwnerId: "u1", note: "personal detail" }), { reason: "OTHER", previousOwnerId: "u1", redacted: true });
  assert.deepEqual(redactPayload("FOLLOW_UP_CANCELLED", { followUpId: "f1", reason: "OTHER", note: "personal detail" }), { followUpId: "f1", reason: "OTHER", redacted: true });
  assert.deepEqual(redactPayload("FOLLOW_UP_SET", { followUpId: "f1", followUpType: "CALL_BACK", dueAt: "x", note: "personal detail" }), { followUpId: "f1", followUpType: "CALL_BACK", redacted: true });
});

test("founder CRM: setFollowUp / completeFollowUp keep working for the Founder, now with the lifecycle behind them", async () => {
  const w = await world();
  const lead = await setFollowUp(w.repos, w.c.id, minutes(120), FOUNDER, minutes(10), { note: "ring after lunch" });
  assert.equal(lead.nextFollowUpAt?.getTime(), minutes(120).getTime());
  const open = (await w.repos.followUps.getOpenByLead(w.c.id))!;
  assert.equal(open.ownerId, null, "a Founder-queue lead's follow-up has no employee");
  assert.equal(open.createdBy, FOUNDER.actorId);
  const done = await completeLeadFollowUp(w.repos, w.c.id, {}, FOUNDER, minutes(110));
  assert.equal(done.status, "COMPLETED");
  assert.equal((await getMissedFollowUps(w.repos, FOUNDER, {}, minutes(500))).length, 0);
});
