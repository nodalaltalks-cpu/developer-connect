import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignLead, captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { prepareDeviceCall, reportDeviceCall, setCallDisposition, MAX_CALL_SECONDS } from "../call-service.ts";
import { classifyCallDuration, CONNECTED_THRESHOLD_SECONDS } from "../call-classification.ts";
import { buildQueue, closeCallingBatch, createCallingBatch, getCallingQueue, listAllBatches, listMyBatches } from "../calling-batch-service.ts";
import { getEmployeeInsights, getMyCallDashboard, resolveRange } from "../call-analytics.ts";
import { importLeadsFromCsv } from "../lead-import-service.ts";
import { returnLeadToFounder } from "../follow-up-service.ts";
import { parsePendingReports } from "../native-bridge.ts";
import { describeCall, toCallView } from "../call-view.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * Phase 2A: the Android-SIM call path and calling batches, in memory.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. The phone is simulated here by calling reportDeviceCall with the figures a
 * phone's call log would carry. That exercises OUR server rules - authorization, idempotency, plausibility, the
 * 10-second classification, analytics, batches. It proves NOTHING about a real Android device, a real SIM, or whether a
 * real call log reports what the code assumes. Real SIM calling is not verified.
 */

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3500 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, a2, a3, b, free] = [await mk(1), await mk(2), await mk(3), await mk(4), await mk(5)];
  for (const l of [a, a2, a3]) await assignLead(repos, staff, l.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(5));
  return {
    repos, staff, priya, rohan, a, a2, a3, b, free,
    priyaActor: (await resolveEmployee(staff, priya.userId))!.actor,
    rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor,
  };
}
type World = Awaited<ReturnType<typeof world>>;

const at = (startMin: number, extraSeconds = 0) => new Date(minutes(startMin).getTime() + extraSeconds * 1000);

/** The phone's report for a call dialed at startMin that talked for `seconds`, received two minutes after it ended. */
async function deviceCall(w: World, leadId: string, seconds: number, startMin = 10, batchId: string | null = null) {
  const prepared = await prepareDeviceCall(w.repos, leadId, w.priyaActor, { batchId }, at(startMin));
  const outcome = await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(startMin, 3), durationSeconds: seconds, simRef: "1", callLogRef: "42", deviceRef: "Pixel" }, w.priyaActor, at(startMin, seconds + 120));
  return { prepared, outcome };
}

// --- the 10-second rule ---------------------------------------------------------------------------

test("classification: <= 10 s is DIALED, strictly > 10 s is CONNECTED — boundary cases 0, 1, 9, 10, 11, 12, 30, 180", () => {
  const expected: Array<[number, "DIALED" | "CONNECTED"]> = [[0, "DIALED"], [1, "DIALED"], [9, "DIALED"], [10, "DIALED"], [11, "CONNECTED"], [12, "CONNECTED"], [30, "CONNECTED"], [180, "CONNECTED"]];
  for (const [seconds, label] of expected) assert.equal(classifyCallDuration(seconds), label, `${seconds}s`);
  assert.equal(CONNECTED_THRESHOLD_SECONDS, 10);
  // Anything that is not a real duration is never "connected".
  for (const bad of [null, undefined, Number.NaN, -5, Number.POSITIVE_INFINITY]) assert.equal(classifyCallDuration(bad as number), bad === Number.POSITIVE_INFINITY ? "DIALED" : "DIALED");
});

test("device report: the server classifies each boundary duration and stores talk time as the phone reported it", async () => {
  const w = await world();
  const leads = [w.a, w.a2, w.a3];
  for (const [i, seconds] of [0, 10, 11].entries()) {
    const { outcome } = await deviceCall(w, leads[i].id, seconds, 10 + i * 10);
    assert.equal(outcome.duplicate, false);
    assert.equal(outcome.call.classification, seconds > 10 ? "CONNECTED" : "DIALED");
    assert.equal(outcome.call.durationSeconds, seconds, "talk time is exactly the phone's figure");
    assert.equal(outcome.call.method, "ANDROID_SIM");
    assert.equal(outcome.call.endedAt?.getTime(), at(10 + i * 10, 3 + seconds).getTime());
  }
});

test("device report: a call that did not reach the other end (0 s) is DIALED / NO_ANSWER; a 5 s call is DIALED / COMPLETED; neither is 'connected'", async () => {
  const w = await world();
  const none = (await deviceCall(w, w.a.id, 0, 10)).outcome.call;
  const short = (await deviceCall(w, w.a2.id, 5, 20)).outcome.call;
  assert.deepEqual([none.status, none.classification], ["NO_ANSWER", "DIALED"]);
  assert.deepEqual([short.status, short.classification], ["COMPLETED", "DIALED"]);
  assert.equal(describeCall(toCallView(none)), "No answer");
  assert.equal(describeCall(toCallView(short)), "Dialed");
});

// --- preparing and reporting ----------------------------------------------------------------------

test("prepare: the server issues the attempt — owner only, number returned to the owner, a CALL_PLACED event, nothing classified or counted yet", async () => {
  const w = await world();
  const { call, toE164 } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  assert.equal(call.method, "ANDROID_SIM");
  assert.equal(call.provider, "android-device");
  assert.equal(call.classification, null);
  assert.equal(call.reportedAt, null);
  assert.equal(toE164, w.a.phoneE164);
  assert.equal(call.phoneLast4, w.a.phoneE164!.slice(-4), "only the last 4 digits are stored on the call");
  assert.ok((await getLeadTimeline(w.repos, w.a.id)).some((e) => e.eventType === "CALL_PLACED"));
  const rows = await w.repos.calls.aggregate({ from: at(0), to: at(999), groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata" });
  assert.deepEqual(rows, [], "an unreported attempt is not activity");
});

test("prepare: an employee cannot call a lead they do not own, a Founder-queue lead, an erased lead or a missing one", async () => {
  const w = await world();
  await assert.rejects(prepareDeviceCall(w.repos, w.b.id, w.priyaActor, {}, at(10)), LeadNotFoundError, "another member's lead");
  await assert.rejects(prepareDeviceCall(w.repos, w.free.id, w.priyaActor, {}, at(10)), LeadNotFoundError, "an unassigned lead");
  await assert.rejects(prepareDeviceCall(w.repos, "00000000-0000-4000-8000-000000000000", w.priyaActor, {}, at(10)), LeadNotFoundError);
  await assert.rejects(prepareDeviceCall(w.repos, w.a.id, { actorType: "BUYER", actorId: "x" }, {}, at(10)), UnauthorizedLeadActionError);
  assert.deepEqual(await w.repos.calls.listByLead(w.b.id), []);
});

test("report: exactly once — a retry (even with different figures) changes nothing and is flagged duplicate", async () => {
  const w = await world();
  const { prepared, outcome } = await deviceCall(w, w.a.id, 45);
  const retry = await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationSeconds: 3, simRef: "2" }, w.priyaActor, at(30));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.call.durationSeconds, 45);
  assert.equal(retry.call.classification, "CONNECTED");
  assert.equal(retry.call.reportedAt?.getTime(), outcome.call.reportedAt?.getTime());
  assert.equal((await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_ENDED").length, 1, "CALL_ENDED is written once");
  assert.equal((await w.repos.calls.listEvents(prepared.call.id)).length, 1, "one raw report is kept as evidence");
});

test("report: only the employee the attempt was issued to can report it; anyone else is told it does not exist", async () => {
  const w = await world();
  const { call } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  const report = { startedAt: at(10, 2), durationSeconds: 60 };
  await assert.rejects(reportDeviceCall(w.repos, call.id, report, w.rohanActor, at(12)), LeadNotFoundError);
  await assert.rejects(reportDeviceCall(w.repos, call.id, report, FOUNDER, at(12)), LeadNotFoundError, "not even the Founder reports someone else's call");
  await assert.rejects(reportDeviceCall(w.repos, "00000000-0000-4000-8000-000000000000", report, w.priyaActor, at(12)), LeadNotFoundError);
  assert.equal((await w.repos.calls.getById(call.id))?.reportedAt, null, "nothing changed");
});

test("report: implausible figures are refused and store nothing — negative, fractional, huge, impossible, wrong time, too old", async () => {
  const w = await world();
  const { call } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  const bad: Array<[Parameters<typeof reportDeviceCall>[2], string]> = [
    [{ startedAt: at(10, 2), durationSeconds: -1 }, "negative"],
    [{ startedAt: at(10, 2), durationSeconds: 1.5 }, "fractional"],
    [{ startedAt: at(10, 2), durationSeconds: MAX_CALL_SECONDS + 1 }, "longer than any call may last"],
    [{ startedAt: at(10, 2), durationSeconds: 3600 }, "longer than the time that has passed"],
    [{ startedAt: at(10, 2), durationSeconds: Number.NaN }, "not a number"],
    [{ startedAt: new Date("garbage"), durationSeconds: 20 }, "invalid start"],
    [{ startedAt: at(1), durationSeconds: 20 }, "started long before the attempt was issued"],
    [{ startedAt: at(90), durationSeconds: 20 }, "starts in the future"],
  ];
  for (const [report, why] of bad) {
    await assert.rejects(reportDeviceCall(w.repos, call.id, report, w.priyaActor, at(12)), LeadValidationError, why);
  }
  await assert.rejects(reportDeviceCall(w.repos, call.id, { startedAt: at(10, 2), durationSeconds: 20 }, w.priyaActor, new Date(at(10).getTime() + 8 * 24 * 3600 * 1000)), LeadValidationError, "an attempt older than a week");
  const stored = await w.repos.calls.getById(call.id);
  assert.equal(stored?.reportedAt, null);
  assert.equal(stored?.classification, null);
  assert.equal((await w.repos.calls.listEvents(call.id)).length, 0, "a refused report leaves no evidence row that would block a good retry");
});

test("report: 'not placed' (backed out of the SIM chooser) is a FAILED attempt with NO classification — it is never a dial", async () => {
  const w = await world();
  const { call } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  const out = await reportDeviceCall(w.repos, call.id, { startedAt: new Date(0), durationSeconds: 0, notPlaced: true }, w.priyaActor, at(11));
  assert.deepEqual([out.call.status, out.call.classification, out.call.endReason], ["FAILED", null, "NOT_PLACED_ON_DEVICE"]);
  const rows = await w.repos.calls.aggregate({ from: at(0), to: at(999), groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata" });
  assert.equal(rows[0].dialed, 0);
  assert.equal(rows[0].failed, 1);
  assert.equal(describeCall(toCallView(out.call)), "Failed");
});

test("the client can never set status, classification, times or talk time: the report type carries only the phone's own call-log figures", async () => {
  const w = await world();
  const { call } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  // Extra fields smuggled into the report object are ignored: the server builds the patch itself.
  const sneaky = { startedAt: at(10, 2), durationSeconds: 4, classification: "CONNECTED", status: "CONNECTED", answeredAt: at(10), endedAt: at(500), disposition: "INTERESTED" } as unknown as Parameters<typeof reportDeviceCall>[2];
  const out = await reportDeviceCall(w.repos, call.id, sneaky, w.priyaActor, at(12));
  assert.equal(out.call.classification, "DIALED");
  assert.equal(out.call.answeredAt, null);
  assert.equal(out.call.disposition, null);
  assert.equal(out.call.endedAt?.getTime(), at(10, 6).getTime());
});

// --- outcomes -------------------------------------------------------------------------------------

test("outcomes: a DIALED call takes no-answer/busy/switched-off/invalid; a CONNECTED call takes interested/not interested/follow-up/callback; once only", async () => {
  const w = await world();
  const dialed = (await deviceCall(w, w.a.id, 4, 10)).outcome.call;
  const connected = (await deviceCall(w, w.a2.id, 90, 20)).outcome.call;
  await assert.rejects(setCallDisposition(w.repos, dialed.id, "INTERESTED", w.priyaActor, at(40)), LeadValidationError);
  await assert.rejects(setCallDisposition(w.repos, connected.id, "NO_ANSWER", w.priyaActor, at(40)), LeadValidationError);
  await assert.rejects(setCallDisposition(w.repos, connected.id, "BUSY", w.priyaActor, at(40)), LeadValidationError);
  assert.equal((await setCallDisposition(w.repos, dialed.id, "BUSY", w.priyaActor, at(41))).disposition, "BUSY");
  assert.equal((await setCallDisposition(w.repos, connected.id, "CALLBACK_REQUESTED", w.priyaActor, at(41))).disposition, "CALLBACK_REQUESTED");
  await assert.rejects(setCallDisposition(w.repos, connected.id, "INTERESTED", w.priyaActor, at(42)), LeadStateError, "an outcome is set once");
  await assert.rejects(setCallDisposition(w.repos, (await deviceCall(w, w.a3.id, 30, 50)).outcome.call.id, "NOT_INTERESTED", w.rohanActor, at(60)), LeadNotFoundError, "not on someone else's call");
});

test("an unfinished attempt cannot be given an outcome", async () => {
  const w = await world();
  const { call } = await prepareDeviceCall(w.repos, w.a.id, w.priyaActor, {}, at(10));
  await assert.rejects(setCallDisposition(w.repos, call.id, "OTHER", w.priyaActor, at(11)), LeadStateError);
});

// --- immutability of reported evidence ------------------------------------------------------------

test("a reported call is immutable: classification and device fields cannot be rewritten afterwards", async () => {
  const w = await world();
  const { outcome } = await deviceCall(w, w.a.id, 5);
  await assert.rejects(w.repos.calls.update(outcome.call.id, { classification: "CONNECTED" }, at(40)), LeadStateError);
  await assert.rejects(w.repos.calls.update(outcome.call.id, { durationSeconds: 500 }, at(40)), LeadStateError);
  await assert.rejects(w.repos.calls.update(outcome.call.id, { simRef: "9" }, at(40)), LeadStateError);
});

// --- analytics ------------------------------------------------------------------------------------

test("analytics: dialed = classified calls, connected = more than 10 s, talk time = the connected calls' durations, per employee and per day", async () => {
  const w = await world();
  await deviceCall(w, w.a.id, 0, 10);
  await deviceCall(w, w.a2.id, 10, 20);
  await deviceCall(w, w.a3.id, 11, 30);
  await deviceCall(w, w.a.id, 180, 40);
  const now = at(60);
  const mine = await getMyCallDashboard(w.repos, w.priyaActor, now, { range: "today" });
  assert.equal(mine.metrics.dialed, 4);
  assert.equal(mine.metrics.connected, 2);
  assert.equal(mine.metrics.talkSeconds, 191, "only connected calls add talk time (11 + 180); a 10 s call adds none");
  assert.equal(mine.metrics.connectionRate, 0.5);
  assert.equal(mine.metrics.avgConnectedSeconds, Math.round(191 / 2));
  assert.equal((await getMyCallDashboard(w.repos, w.rohanActor, now)).metrics.dialed, 0, "Rohan sees none of Priya's calls");

  const insights = await getEmployeeInsights(w.repos, w.staff, FOUNDER, { range: resolveRange("today", now), period: "daily" }, now);
  const priyaRow = insights.rows.find((r) => r.userId === w.priya.userId)!;
  assert.equal(priyaRow.calls.dialed, 4);
  assert.equal(priyaRow.calls.connected, 2);
  assert.equal("score" in priyaRow || "rank" in priyaRow, false, "no score and no ranking");
});

test("analytics: a connected-only filter and a dialed-only filter split the same calls", async () => {
  const w = await world();
  await deviceCall(w, w.a.id, 5, 10);
  await deviceCall(w, w.a2.id, 50, 20);
  const base = { from: at(0), to: at(999), limit: 50 };
  assert.equal((await w.repos.calls.listRecent({ ...base, connected: true })).length, 1);
  assert.equal((await w.repos.calls.listRecent({ ...base, connected: false })).length, 1);
  assert.equal((await w.repos.calls.listRecent({ ...base })).length, 2);
});

// --- calling batches ------------------------------------------------------------------------------

test("batch: Founder only; unowned leads become the member's; another member's leads are left out and counted, never reassigned", async () => {
  const w = await world();
  const input = { name: "Oct list", assigneeStaffId: w.priya.id, leadIds: [w.a.id, w.free.id, w.b.id] };
  await assert.rejects(createCallingBatch(w.repos, w.staff, input, w.priyaActor, at(10)), UnauthorizedLeadActionError);
  const made = await createCallingBatch(w.repos, w.staff, input, FOUNDER, at(10));
  assert.equal(made.included, 2);
  assert.equal(made.ownedByOthers, 1);
  assert.equal((await w.repos.leads.getById(w.free.id))?.ownerId, w.priya.userId, "the unowned lead is now Priya's");
  assert.equal((await w.repos.leads.getById(w.b.id))?.ownerId, w.rohan.userId, "Rohan keeps his lead");
  assert.ok((await getLeadTimeline(w.repos, w.free.id)).some((e) => e.eventType === "OWNER_CHANGED"));
});

test("batch: validation — a name, 1 to 500 leads, an active team member", async () => {
  const w = await world();
  const ok = { name: "x", assigneeStaffId: w.priya.id, leadIds: [w.a.id] };
  await assert.rejects(createCallingBatch(w.repos, w.staff, { ...ok, name: "  " }, FOUNDER), LeadValidationError);
  await assert.rejects(createCallingBatch(w.repos, w.staff, { ...ok, leadIds: [] }, FOUNDER), LeadValidationError);
  await assert.rejects(createCallingBatch(w.repos, w.staff, { ...ok, leadIds: Array.from({ length: 501 }, (_, i) => `l${i}`) }, FOUNDER), LeadValidationError);
  await assert.rejects(createCallingBatch(w.repos, w.staff, { ...ok, assigneeStaffId: "nobody" }, FOUNDER), LeadValidationError);
  await assert.rejects(createCallingBatch(w.repos, w.staff, { ...ok, leadIds: [w.b.id] }, FOUNDER), LeadValidationError, "nothing callable by this member");
});

test("queue: counts and NEXT CALL are derived from call records — pending, connected, dialed, returned — and follow batch order", async () => {
  const w = await world();
  const made = await createCallingBatch(w.repos, w.staff, { name: "Q", assigneeStaffId: w.priya.id, leadIds: [w.a.id, w.a2.id, w.a3.id, w.free.id] }, FOUNDER, at(8));
  const batchId = made.batch.id;
  let queue = (await getCallingQueue(w.repos, w.priyaActor, batchId))!;
  assert.deepEqual(queue.counts, { assigned: 4, completed: 0, connected: 0, dialed: 0, pending: 4, returned: 0 });
  assert.equal(queue.next?.progress.lead.id, w.a.id, "next call is the first pending lead in order");

  await deviceCall(w, w.a.id, 60, 10, batchId); // connected
  await deviceCall(w, w.a2.id, 3, 20, batchId); // dialed
  queue = (await getCallingQueue(w.repos, w.priyaActor, batchId))!;
  assert.deepEqual(queue.counts, { assigned: 4, completed: 2, connected: 1, dialed: 1, pending: 2, returned: 0 });
  assert.equal(queue.next?.progress.lead.id, w.a3.id);

  // A lead the employee returns to the Founder leaves the queue; its history stays.
  await returnLeadToFounder(w.repos, w.a3.id, "NOT_INTERESTED", undefined, w.priyaActor, at(40));
  queue = (await getCallingQueue(w.repos, w.priyaActor, batchId))!;
  assert.equal(queue.counts.returned, 1);
  assert.equal(queue.counts.pending, 1);
  assert.equal(queue.next?.progress.lead.id, w.free.id);
  assert.equal((await w.repos.calls.listByLead(w.a.id)).length, 1, "call history is preserved");
});

test("queue: a retry call to a lead already called counts the lead once; a failed attempt makes nothing 'completed'", async () => {
  const w = await world();
  const { batch } = await createCallingBatch(w.repos, w.staff, { name: "Q", assigneeStaffId: w.priya.id, leadIds: [w.a.id, w.a2.id] }, FOUNDER, at(8));
  await deviceCall(w, w.a.id, 2, 10, batch.id);
  await deviceCall(w, w.a.id, 80, 20, batch.id);
  const { call } = await prepareDeviceCall(w.repos, w.a2.id, w.priyaActor, { batchId: batch.id }, at(30));
  await reportDeviceCall(w.repos, call.id, { startedAt: new Date(0), durationSeconds: 0, notPlaced: true }, w.priyaActor, at(31));
  const q = (await getCallingQueue(w.repos, w.priyaActor, batch.id))!;
  assert.deepEqual(q.counts, { assigned: 2, completed: 1, connected: 1, dialed: 0, pending: 1, returned: 0 });
  assert.equal(q.rows[0].progress.calls, 2);
});

test("batch isolation: another employee cannot read, call from or report into a batch that is not theirs", async () => {
  const w = await world();
  const { batch } = await createCallingBatch(w.repos, w.staff, { name: "Q", assigneeStaffId: w.priya.id, leadIds: [w.a.id] }, FOUNDER, at(8));
  assert.equal(await getCallingQueue(w.repos, w.rohanActor, batch.id), null);
  assert.equal((await getCallingQueue(w.repos, FOUNDER, batch.id))?.batch.id, batch.id, "the Founder sees every batch");
  await assert.rejects(prepareDeviceCall(w.repos, w.a.id, w.rohanActor, { batchId: batch.id }, at(10)), LeadNotFoundError);
  await assert.rejects(prepareDeviceCall(w.repos, w.a2.id, w.priyaActor, { batchId: batch.id }, at(10)), LeadValidationError, "a lead that is not in the batch");
  assert.equal((await listMyBatches(w.repos, w.rohanActor)).length, 0);
  assert.equal((await listMyBatches(w.repos, w.priyaActor)).length, 1);
  await assert.rejects(listAllBatches(w.repos, w.priyaActor), UnauthorizedLeadActionError);
  await assert.rejects(closeCallingBatch(w.repos, batch.id, w.priyaActor), UnauthorizedLeadActionError);
  assert.equal((await closeCallingBatch(w.repos, batch.id, FOUNDER)).status, "CLOSED");
});

test("buildQueue is pure: the same batch and progress always give the same counts", async () => {
  const w = await world();
  const { batch } = await createCallingBatch(w.repos, w.staff, { name: "Q", assigneeStaffId: w.priya.id, leadIds: [w.a.id, w.a2.id] }, FOUNDER, at(8));
  const progress = await w.repos.callingBatches.progress(batch.id);
  assert.deepEqual(buildQueue(batch, progress).counts, buildQueue(batch, progress).counts);
});

// --- CSV import -----------------------------------------------------------------------------------

test("CSV import: source/campaign/notes columns are used, existing numbers are never overwritten, result carries totals and lead ids for a batch", async () => {
  const w = await world();
  const csv = [
    "name,phone,email,source,campaign,notes",
    "New One,9000011111,,Hoarding,Spring,Wants 2BHK",
    `Dup Existing,${w.a.phoneE164!.slice(-10)},changed@example.com,Hoarding,,should not apply`,
    "Bad,12,,,,",
    "New Two,9000022222,,,Fallback,",
  ].join("\n");
  const result = await importLeadsFromCsv(w.repos, csv, { name: "Hoardings", campaign: "Batch campaign" }, FOUNDER, at(10));
  assert.equal(result.totalRows, 4);
  assert.equal(result.created, 2);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.leadIds.length, 3, "new and existing leads are both available to a calling batch");
  const created = (await Promise.all(result.leadIds.map((id) => w.repos.leads.getById(id)))).filter((l) => l && l.importBatchId === result.batch.id);
  assert.deepEqual(created.map((l) => [l!.creationMethod, l!.sourceDetail]).sort(), [["CSV_IMPORT", "Fallback"], ["CSV_IMPORT", "Hoarding"]].sort());
  const existing = (await w.repos.leads.getById(w.a.id))!;
  assert.notEqual(existing.email, "changed@example.com", "an existing lead is not overwritten");
  assert.equal(existing.importBatchId, null);
  const notes = (await Promise.all(created.map((l) => getLeadTimeline(w.repos, l!.id)))).flat().filter((e) => e.eventType === "NOTE_ADDED");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].payload.note, "Wants 2BHK");
});

// --- native bridge parsing ------------------------------------------------------------------------

test("native bridge: the outbox JSON is parsed defensively — malformed entries are dropped, never trusted", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parsePendingReports("not json"), []);
  assert.deepEqual(parsePendingReports('{"a":1}'), []);
  const parsed = parsePendingReports(JSON.stringify([
    { callId: id, startedAtMs: 1000, durationSeconds: 12, simRef: "1", callLogRef: "7", deviceRef: "Pixel", notPlaced: false },
    { callId: "nope", startedAtMs: 1000, durationSeconds: 12 },
    { callId: id, startedAtMs: "x", durationSeconds: 12 },
    { callId: id, startedAtMs: 1000, durationSeconds: -3 },
    { callId: id, startedAtMs: 1000, durationSeconds: 1.5 },
    { callId: id, notPlaced: true },
    null,
  ]));
  assert.equal(parsed.length, 2);
  assert.deepEqual([parsed[0].durationSeconds, parsed[0].notPlaced], [12, false]);
  assert.deepEqual([parsed[1].durationSeconds, parsed[1].notPlaced], [0, true]);
});

// --- static guarantees ----------------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: team device actions authorize the employee first and accept no classification, status, duration-derived label or owner from the browser", () => {
  const actions = read("src/app/team/_actions/team-actions.ts");
  for (const name of ["prepareMyDeviceCallAction", "reportMyDeviceCallAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    const text = body.slice(0, body.indexOf("\nexport ", 10) === -1 ? undefined : body.indexOf("\nexport ", 10));
    assert.match(text.slice(text.indexOf("{") + 1).trimStart(), /^const \{ actor \} = await requireEmployeeForAction\(\);/, `${name} authorizes first`);
  }
  const report = actions.slice(actions.indexOf("export interface DeviceReportInput"), actions.indexOf("export type ReportDeviceCallResult"));
  assert.doesNotMatch(report, /classification|status|answeredAt|endedAt|disposition|staffUserId|ownerId|actor/i, "the report carries only the phone's call-log figures");
});

test("static: the server alone classifies — call-service uses classifyCallDuration; nothing client-side or in the native app does", () => {
  const service = read("src/lib/leads/call-service.ts");
  assert.match(service, /classification: classifyCallDuration\(report\.durationSeconds\)/);
  for (const file of ["src/components/leads/call-button.tsx", "src/components/team/device-call-sync.tsx", "src/lib/leads/native-bridge.ts"]) {
    assert.doesNotMatch(read(file), /classifyCallDuration|CONNECTED_THRESHOLD/, `${file} never decides CONNECTED/DIALED`);
  }
  const native = ["DialerBridge.kt", "CallLogReader.kt", "Outbox.kt", "MainActivity.kt"].map((f) => read(`native-android/app/src/main/java/com/developerconnects/dialer/${f}`)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(native, /CONNECTED|DIALED|> ?10\b|classif/i, "no CRM logic in the native layer");
});

test("static: the Android app requests no audio, microphone, contacts or recording capability, and shows only the allowed host", () => {
  const manifest = read("native-android/app/src/main/AndroidManifest.xml");
  const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(permissions, ["android.permission.CALL_PHONE", "android.permission.INTERNET", "android.permission.READ_CALL_LOG"]);
  assert.doesNotMatch(read("native-android/app/src/main/java/com/developerconnects/dialer/DialerBridge.kt"), /MediaRecorder|AudioRecord|RECORD_AUDIO/);
  assert.match(read("native-android/app/src/main/java/com/developerconnects/dialer/MainActivity.kt"), /shouldOverrideUrlLoading[\s\S]*!allowed\(/);
});

test("static: migration 0022 backfills classification, extends the immutability trigger and is not applied by any script that targets production", () => {
  const sql = read("src/lib/developer-connect/db/migrations/0022_phase2a_mobile_sim_calling.sql");
  assert.match(sql, /CREATE TYPE "public"\."call_classification"/);
  assert.match(sql, /classification' cannot|classification.*cannot be changed|classification/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION guard_lead_call_mutation/);
  assert.doesNotMatch(sql, /DELETE FROM|DROP TABLE|TRUNCATE/i);
});
