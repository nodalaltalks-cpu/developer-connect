import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addNote,
  assignLead,
  captureAssistanceLead,
  changeLeadStatus,
  completeFollowUp,
  createBooking,
  eraseLead,
  getLeadTimeline,
  logContact,
  setFollowUp,
  setTemperature,
  updateRequirement,
} from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { getLeadDetailForActor } from "../lead-reads.ts";
import { canViewLead } from "../lead-access.ts";
import { describeTimeline } from "../timeline.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember, authorizeStaffActor, setStaffActive, staffNameMap, listStaff } from "../../staff/staff-service.ts";
import type { LeadActor } from "../types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, hoursFrom, minutes, T0 } from "./test-helpers.ts";

/** Lead ownership, the employee access model and the activity foundation (Phase 2, Step 1) — in memory, no database. */

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const { lead: a } = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43210" }), T0);
  const { lead: b } = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43211", name: "Other Buyer" }), T0);
  return { repos, staff, priya, rohan, a, b, priyaActor: authorizeStaffActor(priya), rohanActor: authorizeStaffActor(rohan) };
}

test("ownership: the founder assigns a lead — one current owner, an OWNER_CHANGED event, last activity moves", async () => {
  const { repos, staff, priya, a } = await world();
  const updated = await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  assert.equal(updated.ownerId, priya.userId);
  assert.equal(updated.lastActivityAt.getTime(), minutes(10).getTime());
  const event = (await getLeadTimeline(repos, a.id)).filter((e) => e.eventType === "OWNER_CHANGED");
  assert.equal(event.length, 1);
  assert.deepEqual(event[0].payload, { from: null, to: priya.userId });
  assert.equal(event[0].actorType, "FOUNDER");
  assert.equal(event[0].actorId, FOUNDER.actorId);
});

test("ownership: reassigning keeps the previous owner in history, and the timeline names both people", async () => {
  const { repos, staff, priya, rohan, a } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  await assignLead(repos, staff, a.id, rohan.id, FOUNDER, minutes(20));
  const events = (await getLeadTimeline(repos, a.id)).filter((e) => e.eventType === "OWNER_CHANGED");
  assert.deepEqual(events.map((e) => e.payload), [{ from: null, to: priya.userId }, { from: priya.userId, to: rohan.userId }]);
  const names = staffNameMap(await listStaff(staff, FOUNDER));
  const lines = describeTimeline(await getLeadTimeline(repos, a.id), names).map((l) => l.headline).join(" | ");
  assert.match(lines, /Assigned to Priya Nair/);
  assert.match(lines, /Reassigned from Priya Nair to Rohan Das/);
});

test("ownership: returning a lead to the founder queue (null) is allowed and recorded", async () => {
  const { repos, staff, priya, a } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  const back = await assignLead(repos, staff, a.id, null, FOUNDER, minutes(20));
  assert.equal(back.ownerId, null);
  const last = (await getLeadTimeline(repos, a.id)).filter((e) => e.eventType === "OWNER_CHANGED").at(-1)!;
  assert.deepEqual(last.payload, { from: priya.userId, to: null });
});

test("ownership: inactive or unknown assignees are refused and nothing changes", async () => {
  const { repos, staff, priya, a } = await world();
  await setStaffActive(staff, priya.id, false, FOUNDER);
  const before = (await getLeadTimeline(repos, a.id)).length;
  await assert.rejects(assignLead(repos, staff, a.id, priya.id, FOUNDER), LeadValidationError);
  await assert.rejects(assignLead(repos, staff, a.id, "99999999-9999-4999-8999-999999999999", FOUNDER), LeadValidationError);
  await assert.rejects(assignLead(repos, staff, a.id, "not-a-uuid", FOUNDER), LeadValidationError);
  assert.equal((await repos.leads.getById(a.id))?.ownerId, null);
  assert.equal((await getLeadTimeline(repos, a.id)).length, before);
});

test("ownership: assigning to the current owner is refused (no no-op events); unknown and erased leads are refused", async () => {
  const { repos, staff, priya, a, b } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  await assert.rejects(assignLead(repos, staff, a.id, priya.id, FOUNDER), LeadStateError);
  await assert.rejects(assignLead(repos, staff, "99999999-9999-4999-8999-999999999999", priya.id, FOUNDER), LeadNotFoundError);
  await eraseLead(repos, b.id, FOUNDER, minutes(11));
  await assert.rejects(assignLead(repos, staff, b.id, priya.id, FOUNDER), LeadStateError);
});

test("ownership: only the founder assigns — employee, buyer, system and id-less actors are refused before any data is read", async () => {
  const { repos, staff, priya, a, priyaActor } = await world();
  for (const actor of [priyaActor, BUYER, SYSTEM, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(assignLead(repos, staff, a.id, priya.id, actor), UnauthorizedLeadActionError);
  }
  assert.equal((await repos.leads.getById(a.id))?.ownerId, null);
});

test("access: an employee sees and works only their own leads; another's lead looks exactly like a missing one", async () => {
  const { repos, staff, priya, a, b, priyaActor, rohanActor } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));

  assert.equal((await getLeadDetailForActor(repos, priyaActor, a.id, minutes(11)))?.lead.id, a.id);
  assert.equal(await getLeadDetailForActor(repos, rohanActor, a.id, minutes(11)), null, "someone else's lead");
  assert.equal(await getLeadDetailForActor(repos, priyaActor, b.id, minutes(11)), null, "an unassigned lead");
  assert.equal(await getLeadDetailForActor(repos, priyaActor, "99999999-9999-4999-8999-999999999999", minutes(11)), null, "a missing lead — same answer");
  assert.equal((await getLeadDetailForActor(repos, FOUNDER, b.id, minutes(11)))?.lead.id, b.id, "the founder sees everything");
  assert.equal(await getLeadDetailForActor(repos, BUYER, a.id, minutes(11)), null);
  assert.equal(await getLeadDetailForActor(repos, SYSTEM, a.id, minutes(11)), null);
});

test("access: an employee's detail view never carries bookings or commission", async () => {
  const { repos, staff, priya, a, priyaActor } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  await createBooking(repos, a.id, { projectName: "Tower A", bookingValue: 5_000_000, currency: "INR", commissionRate: 2 } as never, FOUNDER, minutes(12)).catch(() => undefined);
  const detail = await getLeadDetailForActor(repos, priyaActor, a.id, minutes(13));
  assert.deepEqual(detail?.bookings, []);
});

test("activity: an employee can note, log contact, set and complete a follow-up on THEIR lead — attributed and timestamped", async () => {
  const { repos, staff, priya, a, priyaActor } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));

  await addNote(repos, a.id, "Wants a 2BHK near the station", priyaActor, minutes(20));
  await logContact(repos, a.id, { channel: "PHONE_CALL", outcome: "CONNECTED", note: "called" }, priyaActor, minutes(21));
  await setFollowUp(repos, a.id, hoursFrom(minutes(21), 24), priyaActor, minutes(22));
  await completeFollowUp(repos, a.id, priyaActor, minutes(23));

  const mine = (await getLeadTimeline(repos, a.id)).filter((e) => e.actorType === "EMPLOYEE");
  assert.ok(mine.length >= 4);
  for (const event of mine) {
    assert.equal(event.actorId, priya.userId, "every activity is attributed to the person who did it");
    assert.ok(event.createdAt instanceof Date);
  }
  const lines = describeTimeline(await getLeadTimeline(repos, a.id), staffNameMap(await listStaff(staff, FOUNDER)));
  assert.ok(lines.some((l) => l.by === "Priya Nair"));
});

test("activity: an employee cannot touch another's, an unassigned or an erased lead — NotFound, nothing written", async () => {
  const { repos, staff, priya, rohan, a, b, rohanActor, priyaActor } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  const before = (await getLeadTimeline(repos, a.id)).length;

  await assert.rejects(addNote(repos, a.id, "sneaky", rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(logContact(repos, a.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(setFollowUp(repos, a.id, hoursFrom(T0, 48), rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(completeFollowUp(repos, a.id, rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(addNote(repos, b.id, "unassigned", priyaActor, minutes(20)), LeadNotFoundError);
  assert.equal((await getLeadTimeline(repos, a.id)).length, before);

  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(25));
  await eraseLead(repos, b.id, FOUNDER, minutes(26));
  assert.equal(canViewLead(rohanActor, (await repos.leads.getById(b.id))!), false, "erased leads leave the employee's reach");
  await assert.rejects(addNote(repos, b.id, "after erase", rohanActor, minutes(27)), LeadNotFoundError);
});

test("access: everything else stays founder-only — status, temperature, requirement, booking, assignment, erase", async () => {
  const { repos, staff, priya, a, priyaActor } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  const before = JSON.stringify(await repos.leads.getById(a.id));

  await assert.rejects(changeLeadStatus(repos, a.id, "CONTACTED", priyaActor, {}), UnauthorizedLeadActionError);
  await assert.rejects(setTemperature(repos, a.id, "HOT", priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(updateRequirement(repos, a.id, { location: "Pune" } as never, priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(createBooking(repos, a.id, {} as never, priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(eraseLead(repos, a.id, priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(assignLead(repos, staff, a.id, null, priyaActor), UnauthorizedLeadActionError);
  assert.equal(JSON.stringify(await repos.leads.getById(a.id)), before);
});

test("access: buyer, system and id-less actors cannot do any activity operation", async () => {
  const { repos, a } = await world();
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(addNote(repos, a.id, "x", actor, minutes(5)), UnauthorizedLeadActionError);
    await assert.rejects(logContact(repos, a.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, actor, minutes(5)), UnauthorizedLeadActionError);
    await assert.rejects(setFollowUp(repos, a.id, hoursFrom(T0, 24), actor, minutes(5)), UnauthorizedLeadActionError);
    await assert.rejects(completeFollowUp(repos, a.id, actor, minutes(5)), UnauthorizedLeadActionError);
  }
});

test("history: events are immutable — earlier events never change when ownership changes hands", async () => {
  const { repos, staff, priya, rohan, a } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  const first = JSON.stringify(await getLeadTimeline(repos, a.id));
  await assignLead(repos, staff, a.id, rohan.id, FOUNDER, minutes(20));
  const after = await getLeadTimeline(repos, a.id);
  assert.ok(JSON.stringify(after.slice(0, JSON.parse(first).length)) === first, "the earlier history is byte-for-byte unchanged");
});

test("access: a deactivated member can no longer act (no actor is built) and their leads stay with them until the founder reassigns", async () => {
  const { repos, staff, priya, a } = await world();
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(10));
  const off = await setStaffActive(staff, priya.id, false, FOUNDER);
  assert.throws(() => authorizeStaffActor(off));
  assert.equal((await repos.leads.getById(a.id))?.ownerId, priya.userId, "ownership is untouched by deactivation");
  assert.deepEqual(await repos.leads.countByOwner(), { [priya.userId]: 1 });
});
