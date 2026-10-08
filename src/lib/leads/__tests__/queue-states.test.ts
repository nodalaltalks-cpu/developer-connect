import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { prepareDeviceCall, reportDeviceCall } from "../call-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { createCallingBatch, getCallingQueue, skipQueueLead } from "../calling-batch-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const at = (m: number, s = 0) => new Date(minutes(m).getTime() + s * 1000);

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const leads = [];
  for (let n = 1; n <= 5; n++) leads.push((await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4400 + n}`, name: `Buyer ${n}` }), T0)).lead);
  for (const l of leads) await assignLead(repos, staff, l.id, priya.id, FOUNDER, minutes(5));
  const made = await createCallingBatch(repos, staff, { name: "08-Oct", assigneeStaffId: priya.id, leadIds: leads.map((l) => l.id) }, FOUNDER, minutes(6));
  return { repos, leads, batchId: made.batch.id, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}
type World = Awaited<ReturnType<typeof world>>;

async function call(w: World, leadId: string, seconds: number | "unavailable", startMin: number) {
  const prepared = await prepareDeviceCall(w.repos, leadId, w.priyaActor, { batchId: w.batchId }, at(startMin));
  const report = seconds === "unavailable" ? { startedAt: at(startMin, 2), durationUnavailable: true } : { startedAt: at(startMin, 2), durationSeconds: seconds, simRef: "1", callLogRef: "1", deviceRef: "Pixel" };
  await reportDeviceCall(w.repos, prepared.call.id, report, w.priyaActor, at(startMin, 200));
}

test("skip: recorded for real, the next lead is offered, and a skipped lead returns once nothing else is left", async () => {
  const w = await world();
  const first = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.equal(first.next!.progress.lead.id, w.leads[0].id);
  await skipQueueLead(w.repos, w.priyaActor, w.batchId, w.leads[0].id, at(10));
  const after = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.equal(after.next!.progress.lead.id, w.leads[1].id, "the next lead is offered");
  assert.equal(after.counts.skipped, 1);
  assert.equal(after.counts.pending, 4);
  assert.equal(after.rows[0].state, "SKIPPED");
  // Skipping twice changes nothing (set once).
  await skipQueueLead(w.repos, w.priyaActor, w.batchId, w.leads[0].id, at(11));
  assert.equal((await getCallingQueue(w.repos, w.priyaActor, w.batchId))!.counts.skipped, 1);
  // Call everyone else: the skipped one comes back.
  for (const [i, l] of w.leads.slice(1).entries()) await call(w, l.id, 30, 20 + i * 5);
  const done = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.equal(done.counts.pending, 0);
  assert.equal(done.next!.progress.lead.id, w.leads[0].id, "the skipped lead is offered again");
  assert.equal(done.next!.state, "SKIPPED");
  // Calling it ends the skip: it is now called.
  await call(w, w.leads[0].id, 4, 60);
  const finished = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.equal(finished.counts.skipped, 0);
  assert.equal(finished.next, null);
  assert.equal(finished.counts.completed, 5);
});

test("skip: only the batch's own employee, only a lead not yet called, only a lead in that batch", async () => {
  const w = await world();
  await assert.rejects(skipQueueLead(w.repos, w.rohanActor, w.batchId, w.leads[0].id), LeadNotFoundError, "another employee's batch looks absent");
  await assert.rejects(skipQueueLead(w.repos, FOUNDER, w.batchId, w.leads[0].id), UnauthorizedLeadActionError);
  await assert.rejects(skipQueueLead(w.repos, w.priyaActor, w.batchId, "00000000-0000-4000-8000-000000000000"), LeadNotFoundError);
  await call(w, w.leads[0].id, 30, 10);
  await assert.rejects(skipQueueLead(w.repos, w.priyaActor, w.batchId, w.leads[0].id), LeadStateError, "a called lead cannot be skipped");
  assert.equal((await getCallingQueue(w.repos, w.priyaActor, w.batchId))!.counts.skipped, 0);
});

test("attempted: a call whose length the phone could not read counts the lead as CALLED (so it is not offered again) but never as connected or not-connected", async () => {
  const w = await world();
  await call(w, w.leads[0].id, "unavailable", 10);
  const queue = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.equal(queue.rows[0].state, "ATTEMPTED");
  assert.equal(queue.counts.attempted, 1);
  assert.equal(queue.counts.completed, 1, "it was called");
  assert.equal(queue.counts.connected, 0);
  assert.equal(queue.counts.notConnected, 0, "nothing is guessed about it");
  assert.equal(queue.counts.pending, 4);
  assert.equal(queue.next!.progress.lead.id, w.leads[1].id, "the attempted lead is not offered again");
});

test("counts: connected, not connected and callback come only from real calls and real follow-ups; remaining = still to call", async () => {
  const w = await world();
  await call(w, w.leads[0].id, 45, 10); // connected
  await call(w, w.leads[1].id, 6, 20); // not connected (10 s or less)
  await call(w, w.leads[2].id, 80, 30); // connected
  await scheduleFollowUp(w.repos, w.leads[2].id, { scheduledAt: at(60 * 24), type: "CALL_BACK" }, w.priyaActor, at(40));
  const { counts } = (await getCallingQueue(w.repos, w.priyaActor, w.batchId))!;
  assert.deepEqual([counts.assigned, counts.completed, counts.connected, counts.notConnected, counts.callback, counts.pending, counts.skipped], [5, 3, 2, 1, 1, 2, 0]);
  assert.equal(counts.dialed, counts.notConnected, "the old name and the new label are the same leads");
});

test("static: the skip button talks to a server action that authorizes first; the migration is additive; the pages show the batch metrics the Founder asked for", () => {
  const actions = read("src/app/team/_actions/team-actions.ts");
  const body = actions.slice(actions.indexOf("export async function skipMyQueueLeadAction"), actions.indexOf("export async function searchMyProjectsAction"));
  assert.ok(body.indexOf("requireEmployeeForAction()") >= 0 && body.indexOf("requireEmployeeForAction()") < body.indexOf("skipQueueLead("));
  const sql = read("src/lib/developer-connect/db/migrations/0032_calling_queue_skip.sql");
  assert.doesNotMatch(sql, /DROP |DELETE |TRUNCATE|UPDATE /i);
  assert.match(sql, /ADD COLUMN "skipped_at"/);
  for (const file of ["src/app/team/queue/page.tsx", "src/app/team/queue/[batchId]/page.tsx"]) {
    const page = read(file);
    for (const label of ["Total", "Called", "Connected", "Not connected", "Callback"]) assert.match(page, new RegExp(`label="${label}"`), `${file} shows ${label}`);
  }
  assert.match(read("src/app/team/queue/[batchId]/page.tsx"), /role="progressbar"/);
});
