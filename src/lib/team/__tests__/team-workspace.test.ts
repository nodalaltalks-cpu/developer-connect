import { test } from "node:test";
import assert from "node:assert/strict";
import { addNote, assignLead, captureAssistanceLead, changeLeadStatus, completeFollowUp, createBooking, eraseLead, getLeadTimeline, logContact, setFollowUp, setTemperature } from "../../leads/lead-service.ts";
import { createInMemoryLeadRepositories } from "../../leads/memory-repository.ts";
import { getLeadDetail, getLeadsPage, getMyLeadDetail, getMyLeadsPage } from "../../leads/lead-reads.ts";
import { LeadNotFoundError, UnauthorizedLeadActionError } from "../../leads/errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember, setStaffActive } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadActor } from "../../leads/types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, hoursFrom, minutes, T0 } from "../../leads/__tests__/test-helpers.ts";

/** The team workspace's server-side rules (Phase 2, Step 2), end to end through the real services, in memory. */

const NOW = minutes(600);

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const lead = async (n: number) =>
    (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${String(3200 + n)}`, name: `Buyer ${n}` }), T0)).lead;
  const l1 = await lead(1);
  const l2 = await lead(2);
  const l3 = await lead(3);
  const l4 = await lead(4);
  await assignLead(repos, staff, l1.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, l2.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, l3.id, rohan.id, FOUNDER, minutes(5));
  const priyaSession = (await resolveEmployee(staff, priya.userId))!;
  const rohanSession = (await resolveEmployee(staff, rohan.userId))!;
  return { repos, staff, priya, rohan, l1, l2, l3, l4, priyaActor: priyaSession.actor, rohanActor: rohanSession.actor };
}

test("auth: a Clerk user that is an active staff member resolves to an EMPLOYEE actor built from the stored row", async () => {
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER);
  const session = await resolveEmployee(staff, "user_priya_0001");
  assert.deepEqual(session?.actor, { actorType: "EMPLOYEE", actorId: "user_priya_0001" });
  assert.equal(session?.member.id, priya.id);
});

test("auth: unknown, signed-out, blank and Founder identities are all denied the same way (null)", async () => {
  const staff = createInMemoryStaffRepository();
  await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER);
  for (const id of ["user_stranger_9", "", null, undefined, FOUNDER.actorId]) {
    assert.equal(await resolveEmployee(staff, id), null, `id ${String(id)}`);
  }
});

test("auth: an inactive member is denied — same answer as an unknown account — and regains access when reactivated", async () => {
  const staff = createInMemoryStaffRepository();
  const member = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER);
  await setStaffActive(staff, member.id, false, FOUNDER);
  assert.equal(await resolveEmployee(staff, "user_priya_0001"), null);
  assert.equal(await resolveEmployee(staff, "user_nobody_000"), null);
  await setStaffActive(staff, member.id, true, FOUNDER);
  assert.ok(await resolveEmployee(staff, "user_priya_0001"));
});

test("my leads: an employee sees only their own, non-erased leads — never another's, never unassigned", async () => {
  const { repos, priyaActor, rohanActor, l1, l2, l3, l4 } = await world();
  const mine = await getMyLeadsPage(repos, priyaActor, "all", 1, NOW);
  assert.deepEqual(mine.items.map((i) => i.lead.id).sort(), [l1.id, l2.id].sort());
  assert.equal(mine.total, 2);
  const his = await getMyLeadsPage(repos, rohanActor, "all", 1, NOW);
  assert.deepEqual(his.items.map((i) => i.lead.id), [l3.id]);
  assert.ok(![...mine.items, ...his.items].some((i) => i.lead.id === l4.id), "the unassigned lead is nobody's");

  await eraseLead(repos, l2.id, FOUNDER, minutes(10));
  assert.deepEqual((await getMyLeadsPage(repos, priyaActor, "all", 1, NOW)).items.map((i) => i.lead.id), [l1.id], "erased leave the list");
});

test("my leads: the filters work inside the employee's own set — New, Follow-up due, Hot", async () => {
  const { repos, priyaActor, rohanActor, l1, l2, l3 } = await world();
  await changeLeadStatus(repos, l2.id, "CONTACTED", FOUNDER, {});
  await setTemperature(repos, l1.id, "HOT", FOUNDER);
  await setTemperature(repos, l3.id, "HOT", FOUNDER); // someone else's hot lead
  await setFollowUp(repos, l2.id, hoursFrom(NOW, 1), priyaActor, minutes(20)); // due later today
  await setFollowUp(repos, l1.id, hoursFrom(NOW, 72), priyaActor, minutes(21)); // days away
  await setFollowUp(repos, l3.id, hoursFrom(NOW, 1), rohanActor, minutes(22)); // someone else's, also due today

  const ids = async (view: "all" | "new" | "follow_up_due" | "hot") => (await getMyLeadsPage(repos, priyaActor, view, 1, NOW)).items.map((i) => i.lead.id);
  assert.deepEqual(await ids("new"), [l1.id], "l2 moved on from NEW");
  assert.deepEqual(await ids("hot"), [l1.id], "Rohan's hot lead never appears");
  assert.deepEqual(await ids("follow_up_due"), [l2.id], "only own due today; l1's is days away");
});

test("my leads: the owner scope comes from the actor — buyers, system, founder and id-less actors are refused before any read", async () => {
  const { repos } = await world();
  for (const actor of [BUYER, SYSTEM, FOUNDER, { actorType: "EMPLOYEE" } as LeadActor]) {
    await assert.rejects(getMyLeadsPage(repos, actor, "all", 1, NOW), UnauthorizedLeadActionError);
    await assert.rejects(getMyLeadDetail(repos, actor, "99999999-9999-4999-8999-999999999999", NOW), UnauthorizedLeadActionError);
  }
});

test("my leads: an unknown view or a hostile page number falls back safely", async () => {
  const { repos, priyaActor } = await world();
  const odd = await getMyLeadsPage(repos, priyaActor, "everything; DROP" as never, -5 as number, NOW);
  assert.equal(odd.page, 1);
  assert.equal(odd.total, 2);
});

test("detail: an employee views their own lead — contact, requirement, timeline, follow-up — in a deliberately narrow shape", async () => {
  const { repos, priyaActor, l1 } = await world();
  const detail = await getMyLeadDetail(repos, priyaActor, l1.id, NOW);
  assert.equal(detail?.lead.id, l1.id);
  assert.ok(detail!.events.length > 0);
  assert.deepEqual(Object.keys(detail!).sort(), ["calls", "developerName", "developersViewed", "events", "followUp", "followUps", "lead", "requirements"].sort());
  for (const forbidden of ["bookings", "consents", "firstTouch", "lastTouch"]) assert.ok(!(forbidden in detail!), `${forbidden} must not be loaded for an employee`);
});

test("detail: another employee's, an unassigned, an erased and a missing lead all give the identical answer (null)", async () => {
  const { repos, priyaActor, l1, l3, l4 } = await world();
  assert.ok(await getMyLeadDetail(repos, priyaActor, l1.id, NOW));
  const answers = [
    await getMyLeadDetail(repos, priyaActor, l3.id, NOW),
    await getMyLeadDetail(repos, priyaActor, l4.id, NOW),
    await getMyLeadDetail(repos, priyaActor, "99999999-9999-4999-8999-999999999999", NOW),
  ];
  assert.deepEqual(answers, [null, null, null]);
  await eraseLead(repos, l1.id, FOUNDER, minutes(30));
  assert.equal(await getMyLeadDetail(repos, priyaActor, l1.id, NOW), null);
});

test("detail: booking events (money figures) never reach an employee's timeline", async () => {
  const { repos, priyaActor, l1 } = await world();
  await createBooking(repos, l1.id, { projectName: "Tower A", bookingValue: 7_500_000, currency: "INR", commissionRate: 2 } as never, FOUNDER, minutes(12));
  const founderView = await getLeadDetail(repos, l1.id, NOW);
  assert.ok(founderView!.events.some((e) => e.eventType === "BOOKING_CREATED"), "precondition: the booking event exists");
  const mine = await getMyLeadDetail(repos, priyaActor, l1.id, NOW);
  assert.ok(!mine!.events.some((e) => e.eventType.startsWith("BOOKING_")));
  assert.ok(!JSON.stringify(mine).includes("7500000"));
});

test("activities: an employee adds a note, logs contact, schedules and completes a follow-up on their own lead — all attributed to them", async () => {
  const { repos, priya, priyaActor, l1 } = await world();
  await addNote(repos, l1.id, "Interested in 2BHK", priyaActor, minutes(20));
  await logContact(repos, l1.id, { channel: "WHATSAPP", outcome: "REPLIED" }, priyaActor, minutes(21));
  await setFollowUp(repos, l1.id, hoursFrom(minutes(21), 24), priyaActor, minutes(22), { note: "send brochure" });
  const afterSet = await repos.leads.getById(l1.id);
  assert.equal(afterSet?.nextFollowUpAt?.getTime(), hoursFrom(minutes(21), 24).getTime());
  await completeFollowUp(repos, l1.id, priyaActor, minutes(23));
  assert.equal((await repos.leads.getById(l1.id))?.nextFollowUpAt, null, "completing clears the follow-up");

  const mine = (await getLeadTimeline(repos, l1.id)).filter((e) => e.actorType === "EMPLOYEE");
  assert.deepEqual([...new Set(mine.map((e) => e.eventType))].sort(), ["CONTACT_LOGGED", "FOLLOW_UP_COMPLETED", "FOLLOW_UP_SET", "NOTE_ADDED"]);
  assert.ok(mine.every((e) => e.actorId === priya.userId));
  const detail = await getMyLeadDetail(repos, priyaActor, l1.id, NOW);
  assert.ok(detail!.events.filter((e) => e.actorId === priya.userId).length >= 4, "their own activity history is visible to them");
});

test("activities: the same four actions on someone else's or an unassigned lead are refused as not-found, and write nothing", async () => {
  const { repos, priyaActor, l3, l4 } = await world();
  for (const target of [l3, l4]) {
    const before = (await getLeadTimeline(repos, target.id)).length;
    await assert.rejects(addNote(repos, target.id, "x", priyaActor, minutes(20)), LeadNotFoundError);
    await assert.rejects(logContact(repos, target.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, priyaActor, minutes(20)), LeadNotFoundError);
    await assert.rejects(setFollowUp(repos, target.id, hoursFrom(NOW, 5), priyaActor, minutes(20)), LeadNotFoundError);
    await assert.rejects(completeFollowUp(repos, target.id, priyaActor, minutes(20)), LeadNotFoundError);
    assert.equal((await getLeadTimeline(repos, target.id)).length, before);
  }
});

test("founder-only: an employee cannot assign, change status or temperature, create a booking or erase — own lead or not", async () => {
  const { repos, staff, rohan, priyaActor, l1, l3 } = await world();
  for (const target of [l1, l3]) {
    await assert.rejects(changeLeadStatus(repos, target.id, "QUALIFIED", priyaActor, {}), UnauthorizedLeadActionError);
    await assert.rejects(setTemperature(repos, target.id, "HOT", priyaActor), UnauthorizedLeadActionError);
    await assert.rejects(createBooking(repos, target.id, {} as never, priyaActor), UnauthorizedLeadActionError);
    await assert.rejects(eraseLead(repos, target.id, priyaActor), UnauthorizedLeadActionError);
    await assert.rejects(assignLead(repos, staff, target.id, rohan.id, priyaActor), UnauthorizedLeadActionError);
  }
  assert.equal((await repos.leads.getById(l1.id))?.status, "NEW");
});

test("founder CRM: the founder's lists and detail are unchanged — every lead, every owner, bookings included", async () => {
  const { repos, l1, l2, l3, l4 } = await world();
  const all = await getLeadsPage(repos, "all", 1, NOW);
  assert.equal(all.total, 4);
  assert.deepEqual(all.items.map((i) => i.lead.id).sort(), [l1.id, l2.id, l3.id, l4.id].sort());
  await createBooking(repos, l3.id, { projectName: "Tower B", bookingValue: 5_000_000, currency: "INR", commissionRate: 2 } as never, FOUNDER, minutes(12));
  const detail = await getLeadDetail(repos, l3.id, NOW);
  assert.equal(detail?.bookings.length, 1);
  assert.ok((await getLeadsPage(repos, "new", 1, NOW)).total >= 4, "founder views take no owner scope");
});
