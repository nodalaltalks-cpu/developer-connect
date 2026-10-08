import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { getMyWorkState } from "../follow-up-reads.ts";
import { createCallingBatch } from "../calling-batch-service.ts";
import { changeLeadStatus, setTemperature } from "../lead-service.ts";
import { chooseNextBestAction, getMyToday, type NextActionCandidates } from "../my-today.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { Lead } from "../types.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const lead = (name: string) => ({ id: name, name } as unknown as Lead);
const item = (name: string) => ({ lead: lead(name), followUp: { id: `f-${name}` } }) as never;

test("next best action: the first applicable rule wins, in the stated order, and every action carries its reason", () => {
  const all: NextActionCandidates = {
    missed: { lead: lead("missed"), followUpId: "f1" },
    dueNow: item("dueNow"),
    visit: { lead: lead("visit"), awaitingOutcome: false, whenLabel: "at 4 PM" },
    nextCall: { lead: lead("call"), batchId: "b1" },
    newLead: lead("new"),
    hotQuiet: lead("hot"),
    dueToday: item("later"),
  };
  const order = ["RESOLVE_MISSED", "FOLLOW_UP_DUE", "SITE_VISIT", "NEXT_CALL", "NEW_LEAD", "HOT_QUIET", "FOLLOW_UP_TODAY"] as const;
  const remaining: NextActionCandidates = { ...all };
  const keys: Array<keyof NextActionCandidates> = ["missed", "dueNow", "visit", "nextCall", "newLead", "hotQuiet", "dueToday"];
  for (const [i, kind] of order.entries()) {
    const action = chooseNextBestAction(remaining)!;
    assert.equal(action.kind, kind);
    assert.ok(action.reason.length > 15, "a plain sentence, not a code");
    delete remaining[keys[i]];
  }
  assert.equal(chooseNextBestAction(remaining), null, "nothing waiting means no action is invented");
  assert.equal(chooseNextBestAction({ nextCall: { lead: lead("c"), batchId: "b" } })!.batchId, "b", "a call from a list keeps its list");
  assert.equal(chooseNextBestAction({ dueNow: item("x") })!.followUpId, "f-x");
  assert.match(chooseNextBestAction({ visit: { lead: lead("v"), awaitingOutcome: true, whenLabel: "x" } })!.reason, /Record what happened/);
});

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number, owner: { id: string }) => {
    const l = (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4600 + n}`, name: `Buyer ${n}` }), T0)).lead;
    await assignLead(repos, staff, l.id, owner.id, FOUNDER, minutes(5));
    return l;
  };
  return { repos, staff, mk, priya, rohan, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}

test("today: the tiles are real counts of the employee's own records, and a calling list gives the next call", async () => {
  const w = await world();
  const now = new Date(T0.getTime() + 24 * 3_600_000);
  const fresh = await w.mk(1, w.priya); // NEW
  const hotLead = await w.mk(2, w.priya);
  const contacted = await w.mk(3, w.priya);
  const theirs = await w.mk(4, w.rohan);
  await setTemperature(w.repos, hotLead.id, "HOT", FOUNDER, minutes(10));
  await changeLeadStatus(w.repos, hotLead.id, "CONTACTED", FOUNDER, {}, minutes(11));
  await changeLeadStatus(w.repos, contacted.id, "QUALIFIED", FOUNDER, {}, minutes(11));
  await scheduleFollowUp(w.repos, contacted.id, { scheduledAt: new Date(now.getTime() + 3 * 3_600_000), type: "CALL_BACK" }, w.priyaActor, now);
  await createCallingBatch(w.repos, w.staff, { name: "List", assigneeStaffId: w.priya.id, leadIds: [fresh.id, hotLead.id] }, FOUNDER, minutes(12));

  const work = await getMyWorkState(w.repos, w.priyaActor, now);
  const today = await getMyToday(w.repos, w.priyaActor, work, now);
  assert.equal(today.tiles.newLeads, 1);
  assert.equal(today.tiles.hotLeads, 1);
  assert.equal(today.tiles.callsRemaining, 2);
  assert.equal(today.tiles.missed, 0);
  assert.equal(today.tiles.requirementsNeeded, 2, "contacted and qualified, neither has a requirement");
  assert.ok(today.tiles.followUpsDue >= 0);
  assert.equal(today.next!.kind, "NEXT_CALL");
  assert.equal(today.next!.lead.id, fresh.id);
  assert.notEqual(today.next!.lead.id, theirs.id, "another employee's lead is never offered");

  const rohanWork = await getMyWorkState(w.repos, w.rohanActor, now);
  const rohan = await getMyToday(w.repos, w.rohanActor, rohanWork, now);
  assert.equal(rohan.tiles.newLeads, 1);
  assert.equal(rohan.tiles.callsRemaining, 0);
  assert.equal(rohan.next!.kind, "NEW_LEAD");
});

test("today: a missed follow-up is on top; only an employee can ask", async () => {
  const w = await world();
  const l = await w.mk(1, w.priya);
  await scheduleFollowUp(w.repos, l.id, { scheduledAt: new Date(T0.getTime() + 2 * 3_600_000), type: "CALL_BACK" }, w.priyaActor, T0);
  const later = new Date(T0.getTime() + 5 * 3_600_000);
  const work = await getMyWorkState(w.repos, w.priyaActor, later);
  const today = await getMyToday(w.repos, w.priyaActor, work, later);
  assert.equal(today.tiles.missed, 1);
  assert.equal(today.next!.kind, "RESOLVE_MISSED");
  assert.equal(today.next!.lead.id, l.id);
  await assert.rejects(getMyToday(w.repos, FOUNDER, work, later), UnauthorizedLeadActionError);
});

test("static: the panel links every tile to the list it counts and the page loads it for the signed-in employee only", () => {
  const panel = read("src/components/team/today-panel.tsx");
  for (const href of ["/team/queue", "/team/follow-ups", "/team/follow-ups?tab=missed", "/team?view=new", "/team?view=hot", "/team/visits"]) assert.ok(panel.includes(href), href);
  assert.match(panel, /Next best action/);
  const page = read("src/app/team/page.tsx");
  assert.match(page, /getMyToday\(repos, actor, work, now\)/);
  assert.match(page, /<TodayPanel today=\{today\} \/>/);
});
