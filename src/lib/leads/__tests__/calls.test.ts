import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLead, captureAssistanceLead, eraseLead, getLeadTimeline } from "../lead-service.ts";
import { getCallForActor, ingestProviderEvent, nextCallState, placeCall, setCallDisposition } from "../call-service.ts";
import { notConfiguredProvider, getTelephonyProvider, TelephonyNotConfiguredError, WebhookVerificationError, type PlaceCallRequest, type ProviderEvent, type TelephonyProvider } from "../telephony.ts";
import { getCallActivity, getEmployeeInsights, getMyCallDashboard, parseInsightFilters, resolveRange, toMetrics, formatCallDuration, formatTalkTime, formatRate } from "../call-analytics.ts";
import { bucketKey } from "../call-buckets.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { describeTimeline } from "../timeline.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, MissedFollowUpBlockError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadActor } from "../types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * The internal dialer's domain rules and the call analytics, in memory. The provider here is a SYNTHETIC test double:
 * it exists to exercise OUR state machine, idempotency, authorization and aggregation. It proves nothing about a real
 * telephony vendor — no real provider is configured, and no real call has been placed.
 */

let providerCallCounter = 0;

function fakeProvider(options: { fail?: boolean } = {}) {
  const placed: PlaceCallRequest[] = [];
  const provider: TelephonyProvider = {
    name: "test-double",
    configured: true,
    async initiateCall(request) {
      if (options.fail) throw new Error("provider unreachable");
      placed.push(request);
      providerCallCounter += 1;
      return { providerCallId: `pc-${providerCallCounter}` };
    },
    parseWebhook() {
      return [];
    },
  };
  return { provider, placed };
}

let eventCounter = 0;
function ev(providerCallId: string, status: ProviderEvent["status"], at: Date, extra: Partial<ProviderEvent> = {}): ProviderEvent {
  eventCounter += 1;
  return { provider: "test-double", providerEventId: `evt-${eventCounter}`, providerCallId, eventType: String(status).toLowerCase(), status, occurredAt: at, payload: { synthetic: true }, ...extra };
}

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3500 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, a2, b, c] = [await mk(1), await mk(2), await mk(3), await mk(4)];
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, a2.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(5));
  return {
    repos, staff, priya, rohan, a, a2, b, c,
    priyaActor: (await resolveEmployee(staff, priya.userId))!.actor,
    rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor,
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Places a call and drives it to a final state with synthetic provider events. */
async function finishedCall(w: World, leadId: string, actor: LeadActor, outcome: "CONNECTED_60" | "NO_ANSWER" | "BUSY" | "REJECTED", startMin: number, seconds = 60) {
  const { provider } = fakeProvider();
  const call = await placeCall(w.repos, provider, leadId, actor, minutes(startMin));
  const id = call.providerCallId!;
  await ingestProviderEvent(w.repos, ev(id, "RINGING", minutes(startMin)), minutes(startMin));
  if (outcome === "CONNECTED_60") {
    await ingestProviderEvent(w.repos, ev(id, "CONNECTED", new Date(minutes(startMin).getTime() + 5_000)), minutes(startMin));
    await ingestProviderEvent(w.repos, ev(id, "COMPLETED", new Date(minutes(startMin).getTime() + (5 + seconds) * 1000), { durationSeconds: seconds }), minutes(startMin + 3));
  } else {
    await ingestProviderEvent(w.repos, ev(id, outcome, new Date(minutes(startMin).getTime() + 20_000)), minutes(startMin));
  }
  return (await w.repos.calls.getById(call.id))!;
}

// --- the provider boundary ------------------------------------------------------------------------

test("no provider: placing a call is refused and NOTHING is recorded — no call row, no event, no activity", async () => {
  const w = await world();
  const before = (await getLeadTimeline(w.repos, w.a.id)).length;
  await assert.rejects(placeCall(w.repos, notConfiguredProvider, w.a.id, w.priyaActor, minutes(10)), TelephonyNotConfiguredError);
  assert.deepEqual(await w.repos.calls.listByLead(w.a.id), []);
  assert.equal((await getLeadTimeline(w.repos, w.a.id)).length, before);
  assert.equal((await w.repos.calls.aggregate({ from: minutes(0), to: minutes(999), groupBy: "DAY", timeZone: "Asia/Kolkata" })).length, 0);
});

test("provider selection: unset, unknown or unregistered names all mean NOT configured — never simulated", async () => {
  for (const env of [{}, { TELEPHONY_PROVIDER: "" }, { TELEPHONY_PROVIDER: "twilio" }, { TELEPHONY_PROVIDER: "acme" }]) {
    const provider = getTelephonyProvider(env);
    assert.equal(provider.configured, false);
    await assert.rejects(provider.initiateCall({ callId: "c", toE164: "+919876543210", staffUserId: "u" }), TelephonyNotConfiguredError);
    assert.throws(() => provider.parseWebhook("{}", {}), WebhookVerificationError);
  }
});

// --- placing --------------------------------------------------------------------------------------

test("place: a real placement creates an INITIATED call — who, which lead, last 4 digits only, a server timestamp, the provider's id — and a timeline event", async () => {
  const w = await world();
  const { provider, placed } = fakeProvider();
  const call = await placeCall(w.repos, provider, w.a.id, w.priyaActor, minutes(10));
  assert.equal(call.status, "INITIATED");
  assert.equal(call.staffUserId, w.priya.userId);
  assert.equal(call.leadId, w.a.id);
  assert.equal(call.direction, "OUTBOUND");
  assert.equal(call.source, "INTERNAL_DIALER");
  assert.equal(call.provider, "test-double");
  assert.match(call.providerCallId ?? "", /^pc-\d+$/);
  assert.equal(call.initiatedAt.getTime(), minutes(10).getTime());
  assert.equal(call.phoneLast4, "3501");
  assert.ok(!JSON.stringify(call).includes("98765"), "the full number is never stored on the call");
  assert.equal(placed[0].callId, call.id);
  assert.equal(placed[0].staffUserId, w.priya.userId);
  const [event] = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_PLACED");
  assert.deepEqual(event.payload, { callId: call.id });
  assert.equal(event.actorId, w.priya.userId);
});

test("place: a provider failure is recorded as a real FAILED attempt (not hidden, not counted as connected)", async () => {
  const w = await world();
  const call = await placeCall(w.repos, fakeProvider({ fail: true }).provider, w.a.id, w.priyaActor, minutes(10));
  assert.equal(call.status, "FAILED");
  assert.equal(call.endReason, "PROVIDER_ERROR");
  assert.equal(call.answeredAt, null);
  const end = (await getLeadTimeline(w.repos, w.a.id)).find((e) => e.eventType === "CALL_ENDED")!;
  assert.equal(end.payload.status, "FAILED");
  assert.equal(end.payload.connected, false);
});

test("place: who may — the owning employee and the Founder; not another employee, an unassigned lead, buyers, system or id-less actors; not an erased lead", async () => {
  const w = await world();
  const { provider } = fakeProvider();
  assert.ok(await placeCall(w.repos, provider, w.a.id, w.priyaActor, minutes(10)));
  assert.ok(await placeCall(w.repos, provider, w.c.id, FOUNDER, minutes(11)), "the Founder may call any lead");
  await assert.rejects(placeCall(w.repos, provider, w.a.id, w.rohanActor, minutes(12)), LeadNotFoundError, "someone else's lead");
  await assert.rejects(placeCall(w.repos, provider, w.c.id, w.priyaActor, minutes(12)), LeadNotFoundError, "an unassigned lead");
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(placeCall(w.repos, provider, w.a.id, actor, minutes(12)), UnauthorizedLeadActionError);
  }
  await eraseLead(w.repos, w.b.id, FOUNDER, minutes(13));
  await assert.rejects(placeCall(w.repos, provider, w.b.id, w.rohanActor, minutes(14)), LeadNotFoundError, "an erased lead is out of the employee's reach");
  await assert.rejects(placeCall(w.repos, provider, w.b.id, FOUNDER, minutes(14)), LeadStateError);
  assert.equal((await w.repos.calls.listByLead(w.a.id)).length, 1);
});

test("place: an employee with an overdue follow-up can only call the lead that has it (the same rule as every other action)", async () => {
  const w = await world();
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(10));
  const { provider } = fakeProvider();
  await assert.rejects(placeCall(w.repos, provider, w.a2.id, w.priyaActor, minutes(100)), MissedFollowUpBlockError);
  assert.ok(await placeCall(w.repos, provider, w.a.id, w.priyaActor, minutes(100)));
});

// --- lifecycle ------------------------------------------------------------------------------------

test("lifecycle: INITIATED → RINGING → CONNECTED → COMPLETED — times and duration come from the provider's events; CALL_ENDED is written once", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10, 222);
  assert.equal(call.status, "COMPLETED");
  assert.equal(call.ringingAt?.getTime(), minutes(10).getTime());
  assert.equal(call.answeredAt?.getTime(), minutes(10).getTime() + 5_000);
  assert.equal(call.endedAt?.getTime(), minutes(10).getTime() + 227_000);
  assert.equal(call.durationSeconds, 222);
  const ends = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_ENDED");
  assert.equal(ends.length, 1);
  assert.deepEqual(ends[0].payload, { callId: call.id, status: "COMPLETED", connected: true, classification: "CONNECTED", durationSeconds: 222 });
  assert.equal(ends[0].actorType, "SYSTEM");
  assert.equal((await w.repos.leads.getById(w.a.id))?.lastActivityAt.getTime(), minutes(13).getTime(), "the lead's last activity moved when the call ended");
  assert.equal((await w.repos.calls.listEvents(call.id)).length, 3, "the raw provider events are kept as evidence");
});

test("lifecycle: NO_ANSWER, BUSY and REJECTED finish the call unconnected — no answered time, no duration, never counted as connected", async () => {
  const w = await world();
  for (const [i, outcome] of (["NO_ANSWER", "BUSY", "REJECTED"] as const).entries()) {
    const call = await finishedCall(w, w.a.id, w.priyaActor, outcome, 10 + i * 10);
    assert.equal(call.status, outcome);
    assert.equal(call.answeredAt, null);
    assert.equal(call.durationSeconds, null);
    assert.ok(call.endedAt);
  }
  const [row] = await w.repos.calls.aggregate({ from: minutes(0), to: minutes(100), groupBy: "EMPLOYEE", timeZone: "Asia/Kolkata" });
  assert.equal(row.dialed, 3);
  assert.equal(row.connected, 0);
  assert.deepEqual([row.noAnswer, row.busy, row.rejected], [1, 1, 1]);
});

test("idempotency: the same provider event delivered five times (even at once) changes the call ONCE and is stored once", async () => {
  const w = await world();
  const call = await placeCall(w.repos, fakeProvider().provider, w.a.id, w.priyaActor, minutes(10));
  const connected = ev(call.providerCallId!, "CONNECTED", minutes(11));
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => ingestProviderEvent(w.repos, connected, minutes(12))));
  assert.equal(results.filter((r) => r.applied).length, 1);
  assert.equal(results.filter((r) => !r.applied && r.reason === "DUPLICATE").length, 4);
  const done = ev(call.providerCallId!, "COMPLETED", minutes(13), { durationSeconds: 120 });
  await Promise.all([1, 2, 3].map(() => ingestProviderEvent(w.repos, done, minutes(14))));
  assert.equal((await w.repos.calls.listEvents(call.id)).length, 2);
  assert.equal((await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_ENDED").length, 1, "one real call is one CALL_ENDED");
  assert.equal((await w.repos.calls.listByLead(w.a.id)).length, 1, "and one call, not five");
});

test("ordering: late or out-of-order events never move a call backwards, and a finished call never changes", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10, 90);
  const id = call.providerCallId!;
  for (const status of ["RINGING", "CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const) {
    const outcome = await ingestProviderEvent(w.repos, ev(id, status, minutes(30)), minutes(30));
    assert.equal(outcome.applied, false, status);
  }
  const after = (await w.repos.calls.getById(call.id))!;
  assert.equal(after.status, "COMPLETED");
  assert.equal(after.durationSeconds, 90);
  assert.equal((await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_ENDED").length, 1);
  // Events that arrive before the call has a status they can improve on are simply ignored, not errors.
  const fresh = await placeCall(w.repos, fakeProvider().provider, w.a2.id, w.priyaActor, minutes(40));
  await ingestProviderEvent(w.repos, ev(fresh.providerCallId!, "CONNECTED", minutes(41)), minutes(41));
  assert.equal((await ingestProviderEvent(w.repos, ev(fresh.providerCallId!, "RINGING", minutes(41)), minutes(41))).applied, false, "RINGING after CONNECTED is stale");
});

test("evidence: a call is never 'connected' without the provider saying it was answered — contradictions are refused, not invented", async () => {
  const w = await world();
  const a = await placeCall(w.repos, fakeProvider().provider, w.a.id, w.priyaActor, minutes(10));
  const outcome = await ingestProviderEvent(w.repos, ev(a.providerCallId!, "COMPLETED", minutes(11), { durationSeconds: 300 }), minutes(11));
  assert.deepEqual([outcome.applied, !outcome.applied && outcome.reason], [false, "INCONSISTENT"]);
  assert.equal((await w.repos.calls.getById(a.id))?.status, "INITIATED");
  assert.equal((await w.repos.calls.getById(a.id))?.answeredAt, null);

  await ingestProviderEvent(w.repos, ev(a.providerCallId!, "CONNECTED", minutes(12)), minutes(12));
  const after = await ingestProviderEvent(w.repos, ev(a.providerCallId!, "NO_ANSWER", minutes(13)), minutes(13));
  assert.deepEqual([after.applied, !after.applied && after.reason], [false, "INCONSISTENT"], "an answered call cannot become 'no answer'");
});

test("evidence: duration is the provider's — or computed from the PROVIDER's own answered/ended times — never from anything the browser sends", () => {
  const base = { id: "c", status: "CONNECTED", answeredAt: new Date("2026-10-12T10:00:00Z"), ringingAt: null, endedAt: null, durationSeconds: null } as never;
  const stated = nextCallState(base, ev("p", "COMPLETED", new Date("2026-10-12T10:05:00Z"), { durationSeconds: 281 }));
  assert.equal(stated?.patch.durationSeconds, 281);
  const computed = nextCallState(base, ev("p", "COMPLETED", new Date("2026-10-12T10:05:00Z")));
  assert.equal(computed?.patch.durationSeconds, 300);
  const bogus = nextCallState(base, ev("p", "COMPLETED", new Date("2026-10-12T10:05:00Z"), { durationSeconds: -5 }));
  assert.equal(bogus?.patch.durationSeconds, 300, "a nonsense duration falls back to the provider's timestamps");
  assert.equal(nextCallState(base, ev("p", null, new Date())), null, "an informational event changes nothing");
});

test("unknown calls and malformed events: an event for a call we never placed is not recorded; a malformed event is rejected", async () => {
  const w = await world();
  const stray = await ingestProviderEvent(w.repos, ev("never-placed", "CONNECTED", minutes(10)), minutes(10));
  assert.deepEqual([stray.applied, !stray.applied && stray.reason], [false, "UNKNOWN_CALL"]);
  assert.equal((await w.repos.calls.aggregate({ from: minutes(0), to: minutes(999), groupBy: "DAY", timeZone: "Asia/Kolkata" })).length, 0, "no phantom call");
  for (const bad of [null, { ...ev("x", "CONNECTED", minutes(1)), providerEventId: "" }, { ...ev("x", "CONNECTED", minutes(1)), occurredAt: new Date("nonsense") }]) {
    await assert.rejects(ingestProviderEvent(w.repos, bad as never, minutes(10)), LeadValidationError);
  }
});

test("immutability: the repository refuses to rewrite a finished call, a provider id, or a disposition once set (as the database trigger does)", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10);
  await assert.rejects(w.repos.calls.update(call.id, { status: "NO_ANSWER" }, minutes(30)), LeadStateError);
  await assert.rejects(w.repos.calls.update(call.id, { durationSeconds: 9999 }, minutes(30)), LeadStateError);
  await assert.rejects(w.repos.calls.update(call.id, { providerCallId: "other" }, minutes(30)), LeadStateError);
  await setCallDisposition(w.repos, call.id, "INTERESTED", w.priyaActor, minutes(31));
  await assert.rejects(w.repos.calls.update(call.id, { disposition: "NOT_INTERESTED" }, minutes(32)), LeadStateError);
});

// --- disposition ----------------------------------------------------------------------------------

test("disposition: recorded once, after the call finished, by who made it — attributed and in the timeline; the status and duration are untouched", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10, 150);
  const updated = await setCallDisposition(w.repos, call.id, "FOLLOW_UP_REQUIRED", w.priyaActor, minutes(20));
  assert.equal(updated.disposition, "FOLLOW_UP_REQUIRED");
  assert.equal(updated.dispositionBy, w.priya.userId);
  assert.equal(updated.dispositionAt?.getTime(), minutes(20).getTime());
  assert.equal(updated.status, "COMPLETED");
  assert.equal(updated.durationSeconds, 150);
  const [event] = (await getLeadTimeline(w.repos, w.a.id)).filter((e) => e.eventType === "CALL_DISPOSITION_SET");
  assert.deepEqual(event.payload, { callId: call.id, disposition: "FOLLOW_UP_REQUIRED" });
  await assert.rejects(setCallDisposition(w.repos, call.id, "INTERESTED", w.priyaActor, minutes(21)), LeadStateError, "once only");
});

test("disposition: must be consistent with what the provider reported — conversation outcomes need a connected call; 'switched off' needs one that did not connect", async () => {
  const w = await world();
  const connected = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10);
  const missed = await finishedCall(w, w.a.id, w.priyaActor, "NO_ANSWER", 30);
  for (const d of ["INTERESTED", "NOT_INTERESTED", "FOLLOW_UP_REQUIRED", "CALLBACK_REQUESTED"] as const) {
    await assert.rejects(setCallDisposition(w.repos, missed.id, d, w.priyaActor, minutes(40)), LeadValidationError, `${d} on an unanswered call`);
  }
  for (const d of ["SWITCHED_OFF", "INVALID_NUMBER"] as const) {
    await assert.rejects(setCallDisposition(w.repos, connected.id, d, w.priyaActor, minutes(40)), LeadValidationError, `${d} on an answered call`);
  }
  await assert.rejects(setCallDisposition(w.repos, connected.id, "BORED" as never, w.priyaActor, minutes(40)), LeadValidationError);
  assert.equal((await setCallDisposition(w.repos, missed.id, "SWITCHED_OFF", w.priyaActor, minutes(41))).disposition, "SWITCHED_OFF");
  assert.equal((await setCallDisposition(w.repos, connected.id, "OTHER", w.priyaActor, minutes(41))).disposition, "OTHER");
});

test("disposition: not before the call finishes; employees only on THEIR calls on THEIR leads; the Founder on any; no one else", async () => {
  const w = await world();
  const live = await placeCall(w.repos, fakeProvider().provider, w.a.id, w.priyaActor, minutes(10));
  await assert.rejects(setCallDisposition(w.repos, live.id, "OTHER", w.priyaActor, minutes(11)), LeadStateError, "still in progress");

  const done = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 20);
  await assert.rejects(setCallDisposition(w.repos, done.id, "OTHER", w.rohanActor, minutes(30)), LeadNotFoundError, "another employee");
  await assert.rejects(setCallDisposition(w.repos, "99999999-9999-4999-8999-999999999999", "OTHER", w.priyaActor, minutes(30)), LeadNotFoundError);
  await assert.rejects(setCallDisposition(w.repos, 42 as never, "OTHER", w.priyaActor, minutes(30)), LeadNotFoundError);
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor]) await assert.rejects(setCallDisposition(w.repos, done.id, "OTHER", actor, minutes(30)), UnauthorizedLeadActionError);
  assert.equal((await setCallDisposition(w.repos, done.id, "INTERESTED", FOUNDER, minutes(31))).dispositionBy, FOUNDER.actorId);

  // A call the Founder placed cannot be described by the employee who owns the lead.
  const founders = await finishedCall(w, w.a2.id, FOUNDER, "CONNECTED_60", 40);
  await assert.rejects(setCallDisposition(w.repos, founders.id, "OTHER", w.priyaActor, minutes(50)), LeadNotFoundError);
});

test("visibility: a call is visible to the Founder, and to an employee only if THEY made it on a lead they own", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10);
  assert.ok(await getCallForActor(w.repos, FOUNDER, call.id));
  assert.ok(await getCallForActor(w.repos, w.priyaActor, call.id));
  assert.equal(await getCallForActor(w.repos, w.rohanActor, call.id), null);
  assert.equal(await getCallForActor(w.repos, w.priyaActor, "99999999-9999-4999-8999-999999999999"), null);
  await assert.rejects(getCallForActor(w.repos, BUYER, call.id), UnauthorizedLeadActionError);
});

test("timeline: every call appears chronologically, in plain words, with its duration and outcome — no comment needed", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10, 222);
  await finishedCall(w, w.a.id, w.priyaActor, "NO_ANSWER", 20);
  await setCallDisposition(w.repos, call.id, "FOLLOW_UP_REQUIRED", w.priyaActor, minutes(30));
  const lines = describeTimeline(await getLeadTimeline(w.repos, w.a.id), { [w.priya.userId]: "Priya Nair" }).map((l) => l.headline);
  assert.ok(lines.includes("Outbound call placed"));
  assert.ok(lines.includes("Outbound call — Completed · 03:42"), lines.join(" | "));
  assert.ok(lines.includes("Outbound call — No answer"));
  assert.ok(lines.includes("Call outcome — Follow up required"));
  const events = await getLeadTimeline(w.repos, w.a.id);
  const times = events.map((e) => e.createdAt.getTime());
  assert.deepEqual([...times].sort((x, y) => x - y), times);
});

// --- analytics ------------------------------------------------------------------------------------

test("buckets: cut in the business zone — a call at 18:45 UTC is 00:15 IST the NEXT day, and weeks start on Monday", () => {
  const late = new Date("2026-10-12T18:45:00Z");
  assert.equal(bucketKey(late, "HOUR_OF_DAY", "Asia/Kolkata"), "00");
  assert.equal(bucketKey(late, "DAY", "Asia/Kolkata"), "2026-10-13");
  assert.equal(bucketKey(late, "DAY", "UTC"), "2026-10-12");
  assert.equal(bucketKey(late, "HOUR", "Asia/Kolkata"), "2026-10-13T00");
  assert.equal(bucketKey(new Date("2026-10-14T05:00:00Z"), "WEEK", "Asia/Kolkata"), "2026-10-12", "Wednesday → that week's Monday");
  assert.equal(bucketKey(new Date("2026-10-11T05:00:00Z"), "WEEK", "Asia/Kolkata"), "2026-10-05", "Sunday belongs to the week that began the Monday before");
  assert.equal(bucketKey(late, "MONTH", "Asia/Kolkata"), "2026-10");
  assert.equal(bucketKey(new Date("2026-12-31T20:00:00Z"), "QUARTER", "Asia/Kolkata"), "2027-Q1");
  assert.equal(bucketKey(new Date("2026-12-31T20:00:00Z"), "YEAR", "Asia/Kolkata"), "2027");
});

test("ranges: today, yesterday, last 7 and 30 days and a custom range are exact instants in India time; bad custom ranges are refused", () => {
  const now = new Date("2026-10-12T10:00:00Z"); // 15:30 IST
  const today = resolveRange("today", now);
  assert.equal(today.from.toISOString(), "2026-10-11T18:30:00.000Z");
  assert.equal(today.to.toISOString(), "2026-10-12T18:30:00.000Z");
  assert.equal(resolveRange("yesterday", now).to.toISOString(), today.from.toISOString());
  assert.equal(resolveRange("last7", now).from.toISOString(), "2026-10-05T18:30:00.000Z");
  assert.equal(resolveRange("last30", now).from.toISOString(), "2026-09-12T18:30:00.000Z");
  const custom = resolveRange("custom", now, { from: "2026-10-01", to: "2026-10-03" });
  assert.equal(custom.from.toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(custom.to.toISOString(), "2026-10-03T18:30:00.000Z", "the end date is inclusive");
  for (const bad of [{ from: "2026-10-05", to: "2026-10-01" }, { from: "nonsense", to: "2026-10-01" }, {}, { from: "2025-01-01", to: "2026-10-01" }]) assert.throws(() => resolveRange("custom", now, bad), LeadValidationError);
  const parsed = parseInsightFilters({ range: "custom", from: "bad", to: "bad", period: "monthly", employee: "u1", source: "SELF_GENERATED", connected: "yes", status: "BUSY" }, now);
  assert.equal(parsed.range.label, "Today", "an unusable range falls back safely");
  assert.deepEqual([parsed.period, parsed.employeeId, parsed.sourceType, parsed.connected, parsed.statuses], ["monthly", "u1", "SELF_GENERATED", true, ["BUSY"]]);
  assert.equal(parseInsightFilters({ period: "hourly", source: "X", status: "NOPE" }, now).period, "daily");
});

test("metrics and formats: rates are null (not 0%) with nothing dialed; talk time and durations read the way a person says them", () => {
  assert.equal(toMetrics(undefined).connectionRate, null);
  assert.equal(toMetrics(undefined).avgConnectedSeconds, null);
  const m = toMetrics({ key: "k", dialed: 47, connected: 21, noAnswer: 19, busy: 4, failed: 3, rejected: 0, talkSeconds: 4200, leadsCalled: 40 });
  assert.equal(formatRate(m.connectionRate), "45%");
  assert.equal(m.avgConnectedSeconds, 200);
  assert.equal(formatTalkTime(8040), "2h 14m");
  assert.equal(formatTalkTime(185), "3m 05s");
  assert.equal(formatCallDuration(222), "03:42");
  assert.equal(formatCallDuration(null), "—");
  assert.equal(formatRate(null), "—");
});

async function seedCalls(w: World) {
  // Priya: two connected (60s, 120s), one no answer, one busy. Rohan: one connected (30s), one no answer.
  await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10, 60);
  await finishedCall(w, w.a2.id, w.priyaActor, "CONNECTED_60", 15, 120);
  await finishedCall(w, w.a.id, w.priyaActor, "NO_ANSWER", 20);
  await finishedCall(w, w.a2.id, w.priyaActor, "BUSY", 25);
  await finishedCall(w, w.b.id, w.rohanActor, "CONNECTED_60", 12, 30);
  await finishedCall(w, w.b.id, w.rohanActor, "NO_ANSWER", 22);
}

test("aggregation: one query answers every grouping — employee, hour, day — and dialed vs connected come only from real call records", async () => {
  const w = await world();
  await seedCalls(w);
  const base = { from: minutes(0), to: minutes(600), timeZone: "Asia/Kolkata" } as const;
  const byEmployee = await w.repos.calls.aggregate({ ...base, groupBy: "EMPLOYEE" });
  const priya = byEmployee.find((r) => r.key === w.priya.userId)!;
  assert.deepEqual([priya.dialed, priya.connected, priya.noAnswer, priya.busy, priya.talkSeconds, priya.leadsCalled], [4, 2, 1, 1, 180, 2]);
  const rohan = byEmployee.find((r) => r.key === w.rohan.userId)!;
  assert.deepEqual([rohan.dialed, rohan.connected, rohan.talkSeconds], [2, 1, 30]);

  const hours = await w.repos.calls.aggregate({ ...base, groupBy: "HOUR_OF_DAY" });
  assert.equal(hours.reduce((n, r) => n + r.dialed, 0), 6, "every call lands in exactly one hour");
  assert.deepEqual((await w.repos.calls.aggregate({ ...base, groupBy: "DAY" })).map((r) => r.dialed), [6], "T0 is one business day");
});

test("aggregation: the filters — employee, connected, status, source type — narrow the same query; a self-generated lead's calls stay separate from digital ones", async () => {
  const w = await world();
  await seedCalls(w);
  await w.repos.leads.update(w.b.id, { sourceType: "SELF_GENERATED", creationMethod: "EXCEL_IMPORT" }, minutes(2));
  const q = { from: minutes(0), to: minutes(600), timeZone: "Asia/Kolkata", groupBy: "EMPLOYEE" } as const;
  const total = (rows: Awaited<ReturnType<typeof w.repos.calls.aggregate>>) => rows.reduce((n, r) => n + r.dialed, 0);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, staffUserId: w.priya.userId })), 4);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, connected: true })), 3);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, connected: false })), 3);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, statuses: ["BUSY"] })), 1);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, sourceType: "SELF_GENERATED" })), 2, "only Rohan's lead is self-generated");
  assert.equal(total(await w.repos.calls.aggregate({ ...q, sourceType: "DIGITAL" })), 4);
  assert.equal(total(await w.repos.calls.aggregate({ ...q, from: minutes(18) })), 3, "the range is applied to the call's start");
  const lead = (await w.repos.leads.getById(w.b.id))!;
  assert.equal(lead.sourceType, "SELF_GENERATED", "calling a lead never changes where it came from");
});

test("Founder insights: per employee, by hour (24 buckets, dialed AND connected) and by period; every team member listed; no score, no ranking", async () => {
  const w = await world();
  await seedCalls(w);
  await w.repos.followUps.create({ leadId: w.a.id, type: "CALL_BACK", scheduledAt: minutes(5), ownerId: w.priya.userId, note: null, createdBy: w.priya.userId, now: minutes(1) });
  const filters = parseInsightFilters({ range: "last30", period: "daily" }, minutes(30));
  const insights = await getEmployeeInsights(w.repos, w.staff, FOUNDER, filters, minutes(30));
  assert.deepEqual(insights.rows.map((r) => r.name), ["Priya Nair", "Rohan Das"], "alphabetical, never ranked by calls");
  const priya = insights.rows[0];
  assert.deepEqual([priya.calls.dialed, priya.calls.connected, priya.calls.talkSeconds, priya.calls.leadsCalled], [4, 2, 180, 2]);
  assert.equal(priya.followUps.missedNow, 1, "an overdue follow-up of theirs");
  assert.equal(insights.hourly.length, 24);
  assert.equal(insights.hourly.reduce((n, h) => n + h.dialed, 0), 6);
  assert.equal(insights.hourly.reduce((n, h) => n + h.connected, 0), 3);
  assert.deepEqual([insights.totals.dialed, insights.totals.connected], [6, 3]);
  assert.equal(insights.periods.reduce((n, p) => n + p.dialed, 0), 6);
  assert.ok(!JSON.stringify(insights).match(/score|rank|index/i), "no invented performance score");
  const one = await getEmployeeInsights(w.repos, w.staff, FOUNDER, { ...filters, employeeId: w.rohan.userId }, minutes(30));
  assert.deepEqual(one.rows.map((r) => r.name), ["Rohan Das"]);
  assert.equal(one.totals.dialed, 2, "the hourly chart follows the employee filter");
  const quiet = await getEmployeeInsights(w.repos, w.staff, FOUNDER, parseInsightFilters({ range: "yesterday" }, new Date("2030-01-01T10:00:00Z")), minutes(30));
  assert.equal(quiet.rows.length, 2, "team members with no calls still appear");
  assert.equal(quiet.rows[0].calls.connectionRate, null);
});

test("Founder insights: outcomes sit beside activity — returned leads, current qualified/site-visit/booked leads and revenue per currency", async () => {
  const w = await world();
  await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10);
  await w.repos.leads.update(w.a.id, { status: "QUALIFIED" }, minutes(11));
  await w.repos.leads.update(w.a2.id, { status: "BOOKED" }, minutes(11));
  await w.repos.bookings.create({ leadId: w.a2.id, developerId: null, projectName: "Tower A", currency: "INR", bookingValue: 9_000_000, commissionExpected: 100, bookedAt: minutes(12), createdBy: "x", now: minutes(12) });
  await w.repos.events.append({ leadId: w.b.id, eventType: "RETURNED_TO_FOUNDER", actorType: "EMPLOYEE", actorId: w.rohan.userId, developerId: null, fromStatus: null, toStatus: null, payload: { reason: "OTHER" }, createdAt: minutes(13) });
  const insights = await getEmployeeInsights(w.repos, w.staff, FOUNDER, parseInsightFilters({ range: "last30" }, minutes(30)), minutes(30));
  const priya = insights.rows.find((r) => r.name === "Priya Nair")!;
  assert.deepEqual(priya.currentLeads, { qualified: 1, siteVisit: 0, booked: 1 });
  assert.deepEqual(priya.revenue, [{ currency: "INR", total: 9_000_000, count: 1 }]);
  assert.equal(insights.rows.find((r) => r.name === "Rohan Das")!.leadsReturned, 1);
});

test("dashboards: an employee's 'My calls' is their own real numbers; the Founder's activity feed shows real calls; both are scoped on the server", async () => {
  const w = await world();
  await seedCalls(w);
  const mine = await getMyCallDashboard(w.repos, w.priyaActor, minutes(30));
  assert.deepEqual([mine.metrics.dialed, mine.metrics.connected, mine.metrics.noAnswer, mine.metrics.busy], [4, 2, 1, 1]);
  assert.equal(mine.metrics.talkSeconds, 180);
  assert.equal(mine.metrics.avgConnectedSeconds, 90);
  assert.ok(mine.recent.every((r) => r.call.staffUserId === w.priya.userId), "only my own calls");
  assert.equal((await getMyCallDashboard(w.repos, w.rohanActor, minutes(30))).metrics.dialed, 2);
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor]) await assert.rejects(getMyCallDashboard(w.repos, actor, minutes(30)), UnauthorizedLeadActionError);

  const filters = parseInsightFilters({ range: "last30" }, minutes(30));
  const feed = await getCallActivity(w.repos, FOUNDER, filters);
  assert.equal(feed.length, 6);
  assert.ok(feed[0].call.initiatedAt.getTime() >= feed.at(-1)!.call.initiatedAt.getTime(), "newest first");
  assert.equal((await getCallActivity(w.repos, FOUNDER, { ...filters, connected: true })).length, 3);
  await assert.rejects(getCallActivity(w.repos, w.priyaActor, filters), UnauthorizedLeadActionError);
  await assert.rejects(getEmployeeInsights(w.repos, w.staff, w.priyaActor, filters), UnauthorizedLeadActionError);
});

test("erasure: a call stays in the record (history and counts) but the lead's identity does not; no event keeps a number", async () => {
  const w = await world();
  const call = await finishedCall(w, w.a.id, w.priyaActor, "CONNECTED_60", 10);
  await eraseLead(w.repos, w.a.id, FOUNDER, minutes(30));
  assert.equal((await w.repos.calls.getById(call.id))?.status, "COMPLETED");
  const [row] = await w.repos.calls.listRecent({ limit: 10 });
  assert.equal(row.lead.name, null);
  assert.ok(row.lead.erasedAt);
  assert.ok(!JSON.stringify(await getLeadTimeline(w.repos, w.a.id)).includes("98765"));
  assert.equal((await w.repos.calls.aggregate({ from: minutes(0), to: minutes(600), groupBy: "DAY", timeZone: "Asia/Kolkata" }))[0].dialed, 1, "the call still counts");
});
