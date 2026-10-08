import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { FOLLOW_UP_TABS, getMyFollowUpBoard, parseFollowUpTab, splitUnresolved } from "../follow-up-board.ts";
import { toBusinessLocalInput, businessLocalToInstant } from "../format.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

// 09:30 India time on 8 Oct 2026. The business day ends at 18:30Z (midnight India time).
const NOW = new Date("2026-10-08T04:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number, owner: { id: string }) => {
    const lead = (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4500 + n}`, name: `Buyer ${n}` }), T0)).lead;
    await assignLead(repos, staff, lead.id, owner.id, FOUNDER, minutes(5));
    return lead;
  };
  return { repos, mk, priya, rohan, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}

test("board: today, upcoming (two weeks), overdue and missed are separated by the clock and the business day", async () => {
  const w = await world();
  const today = await w.mk(1, w.priya);
  const tomorrow = await w.mk(2, w.priya);
  const farAway = await w.mk(3, w.priya);
  const earlierToday = await w.mk(4, w.priya);
  const earlierDay = await w.mk(5, w.priya);
  const dayBefore = new Date(NOW.getTime() - 2 * DAY);
  await scheduleFollowUp(w.repos, today.id, { scheduledAt: new Date(NOW.getTime() + 5 * HOUR), type: "CALL_BACK" }, w.priyaActor, NOW);
  await scheduleFollowUp(w.repos, tomorrow.id, { scheduledAt: new Date(NOW.getTime() + 30 * HOUR), type: "CALL_BACK" }, w.priyaActor, NOW);
  await scheduleFollowUp(w.repos, farAway.id, { scheduledAt: new Date(NOW.getTime() + 20 * DAY), type: "CALL_BACK" }, w.priyaActor, NOW);
  // Created LAST, each at a "now" when nothing was missed yet (the discipline rule blocks scheduling while a miss exists).
  // Created this morning for 04:30Z (before NOW + 1h): it passes during the day, becoming overdue.
  await scheduleFollowUp(w.repos, earlierToday.id, { scheduledAt: new Date(NOW.getTime() + 0.5 * HOUR), type: "WHATSAPP_FOLLOW_UP" }, w.priyaActor, new Date(NOW.getTime() - HOUR));
  await scheduleFollowUp(w.repos, earlierDay.id, { scheduledAt: new Date(dayBefore.getTime() + 6 * HOUR), type: "CALL_BACK" }, w.priyaActor, dayBefore);

  const now = new Date(NOW.getTime() + HOUR); // 10:30 India time: the 04:30Z follow-up has passed
  const board = await getMyFollowUpBoard(w.repos, w.priyaActor, "today", now);
  assert.deepEqual(board.counts, { today: 1, overdue: 1, upcoming: 1, missed: 1 }, "the far-away one is outside the two-week window");
  assert.deepEqual(board.items.map((i) => i.lead.name), ["Buyer 1"]);
  const names = async (tab: (typeof FOLLOW_UP_TABS)[number]) => (await getMyFollowUpBoard(w.repos, w.priyaActor, tab, now)).items.map((i) => i.lead.name);
  assert.deepEqual(await names("overdue"), ["Buyer 4"]);
  assert.deepEqual(await names("missed"), ["Buyer 5"]);
  assert.deepEqual(await names("upcoming"), ["Buyer 2"]);
});

test("board: only the signed-in employee's own follow-ups; anyone else is refused; misses are recorded exactly once", async () => {
  const w = await world();
  const mine = await w.mk(1, w.priya);
  const theirs = await w.mk(2, w.rohan);
  await scheduleFollowUp(w.repos, mine.id, { scheduledAt: new Date(NOW.getTime() + HOUR), type: "CALL_BACK" }, w.priyaActor, NOW);
  await scheduleFollowUp(w.repos, theirs.id, { scheduledAt: new Date(NOW.getTime() + HOUR), type: "CALL_BACK" }, w.rohanActor, NOW);
  const later = new Date(NOW.getTime() + 2 * HOUR);
  const board = await getMyFollowUpBoard(w.repos, w.priyaActor, "overdue", later);
  assert.deepEqual(board.items.map((i) => i.lead.id), [mine.id]);
  await getMyFollowUpBoard(w.repos, w.priyaActor, "overdue", new Date(later.getTime() + 60_000));
  const missedEvents = (await getLeadTimeline(w.repos, mine.id)).filter((e) => e.eventType === "FOLLOW_UP_MISSED");
  assert.equal(missedEvents.length, 1, "viewing the board twice records the miss once");
  assert.equal((await getLeadTimeline(w.repos, theirs.id)).filter((e) => e.eventType === "FOLLOW_UP_MISSED").length, 0, "another employee's miss is not recorded by this view");
  await assert.rejects(getMyFollowUpBoard(w.repos, FOUNDER, "today", NOW), UnauthorizedLeadActionError);
  await assert.rejects(getMyFollowUpBoard(w.repos, { actorType: "BUYER", actorId: "x" }, "today", NOW), UnauthorizedLeadActionError);
});

test("board: tab names come from a fixed list, and the split is a pure function of the start of the day", () => {
  assert.equal(parseFollowUpTab("missed"), "missed");
  assert.equal(parseFollowUpTab(["overdue", "x"]), "overdue");
  for (const bad of [undefined, "", "MISSED", "all", "x; drop"]) assert.equal(parseFollowUpTab(bad), "today");
  const row = (iso: string) => ({ followUp: { scheduledAt: new Date(iso) }, lead: {} }) as never;
  const split = splitUnresolved([row("2026-10-07T10:00:00Z"), row("2026-10-08T01:00:00Z")], new Date("2026-10-07T18:30:00Z"));
  assert.equal(split.missed.length, 1);
  assert.equal(split.overdue.length, 1);
});

test("business time: a datetime-local default is the India clock, not the browser's, and round-trips exactly", () => {
  const instant = new Date("2026-10-08T20:30:00Z"); // 02:00 on 9 Oct in India
  assert.equal(toBusinessLocalInput(instant), "2026-10-09T02:00");
  assert.equal(toBusinessLocalInput(instant, { addDays: 1, atHour: 10 }), "2026-10-10T10:00");
  assert.equal(toBusinessLocalInput(new Date("2026-12-31T20:00:00Z"), { addDays: 1, atHour: 9, atMinute: 30 }), "2027-01-02T09:30");
  assert.equal(businessLocalToInstant(toBusinessLocalInput(instant))!.toISOString(), instant.toISOString());
});

test("static: the page is team-only and scoped from the session; the nav sends Follow-ups to the board; quick actions are server actions", () => {
  const page = read("src/app/team/follow-ups/page.tsx");
  assert.match(page, /requireEmployee\(\)/);
  assert.match(page, /getMyFollowUpBoard\(createPostgresLeadRepositories\(\), actor, tab,/);
  assert.doesNotMatch(page, /ownerId|searchParams\.owner/i, "the owner comes from the session, never the URL");
  assert.match(read("src/components/team/team-nav.tsx"), /href: "\/team\/follow-ups", label: "Follow-ups"/);
  const actions = read("src/components/team/follow-up-quick-actions.tsx");
  assert.match(actions, /completeMyLeadFollowUpAction/);
  assert.match(actions, /rescheduleMyLeadFollowUpAction/);
  assert.match(actions, /toBusinessLocalInput/);
  for (const label of ["Done", "+1 hour", "Tomorrow 10:00", "Pick a time", "Return…"]) assert.ok(actions.includes(label), label);
});
