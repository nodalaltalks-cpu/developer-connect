import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { DURATION_UNAVAILABLE, prepareDeviceCall, reportDeviceCall, setCallDisposition } from "../call-service.ts";
import { getMyCallDashboard } from "../call-analytics.ts";
import { describeCall, toCallView } from "../call-view.ts";
import { parsePendingReports, readCapabilities, type DCDialerNative } from "../native-bridge.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadValidationError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const kotlin = (file: string) => read(`native-android/app/src/main/java/com/developerconnects/dialer/${file}`);
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const lead = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 44301", name: "Buyer" }), T0)).lead;
  await assignLead(repos, staff, lead.id, priya.id, FOUNDER, minutes(5));
  return { repos, lead, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}
const at = (m: number, s = 0) => new Date(minutes(m).getTime() + s * 1000);

// --- the honest fallback: placed, but the phone cannot read the length ---------------------------------------------------

test("length unavailable: recorded as attempted with NO duration and NO classification - never Connected, never Dialed, nothing guessed", async () => {
  const w = await world();
  const prepared = await prepareDeviceCall(w.repos, w.lead.id, w.priyaActor, {}, at(10));
  const { call, duplicate } = await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationUnavailable: true, simRef: null, callLogRef: null, deviceRef: "Pixel", durationSeconds: 999 }, w.priyaActor, at(12));
  assert.equal(duplicate, false);
  assert.equal(call.status, "COMPLETED");
  assert.equal(call.classification, null, "the server does not guess");
  assert.equal(call.durationSeconds, null, "a duration sent alongside the flag is ignored");
  assert.equal(call.endReason, DURATION_UNAVAILABLE);
  assert.equal(toCallView(call).durationUnknown, true);
  assert.equal(describeCall(toCallView(call)), "Attempted (length not recorded)");
  const ended = (await getLeadTimeline(w.repos, w.lead.id)).find((e) => e.eventType === "CALL_ENDED")!;
  assert.equal(ended.payload.durationUnavailable, true);
  assert.equal(ended.payload.connected, false);
  assert.equal("durationSeconds" in ended.payload, false);
});

test("length unavailable: it is not counted as dialed or connected in the employee's numbers, and a retry changes nothing", async () => {
  const w = await world();
  const prepared = await prepareDeviceCall(w.repos, w.lead.id, w.priyaActor, {}, at(10));
  await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationUnavailable: true }, w.priyaActor, at(12));
  const again = await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationSeconds: 120 }, w.priyaActor, at(13));
  assert.equal(again.duplicate, true);
  assert.equal(again.call.classification, null, "a later report cannot classify it");
  const dashboard = await getMyCallDashboard(w.repos, w.priyaActor, at(60), { range: "today" });
  assert.equal(dashboard.metrics.dialed, 0);
  assert.equal(dashboard.metrics.connected, 0);
});

test("length unavailable: the employee states the outcome themselves (any of them); a measured call keeps its strict rules", async () => {
  const w = await world();
  const prepared = await prepareDeviceCall(w.repos, w.lead.id, w.priyaActor, {}, at(10));
  await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationUnavailable: true }, w.priyaActor, at(12));
  const set = await setCallDisposition(w.repos, prepared.call.id, "INTERESTED", w.priyaActor, at(13));
  assert.equal(set.disposition, "INTERESTED");
  await assert.rejects(setCallDisposition(w.repos, prepared.call.id, "NO_ANSWER", w.priyaActor, at(14)), /already has an outcome/);

  // A MEASURED 5-second call is DIALED and cannot be called "interested": unchanged.
  const second = await prepareDeviceCall(w.repos, w.lead.id, w.priyaActor, {}, at(20));
  await reportDeviceCall(w.repos, second.call.id, { startedAt: at(20, 2), durationSeconds: 5, simRef: "1", callLogRef: "3", deviceRef: "Pixel" }, w.priyaActor, at(22));
  await assert.rejects(setCallDisposition(w.repos, second.call.id, "INTERESTED", w.priyaActor, at(23)), LeadValidationError);
  await assert.rejects(setCallDisposition(w.repos, prepared.call.id, "OTHER", w.rohanActor, at(24)), LeadNotFoundError);
});

test("length unavailable: validation - a real start time inside the attempt window is required; only the issued employee can report; nothing client-side classifies", async () => {
  const w = await world();
  const prepared = await prepareDeviceCall(w.repos, w.lead.id, w.priyaActor, {}, at(10));
  await assert.rejects(reportDeviceCall(w.repos, prepared.call.id, { startedAt: new Date("nope"), durationUnavailable: true }, w.priyaActor, at(12)), LeadValidationError);
  await assert.rejects(reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(500), durationUnavailable: true }, w.priyaActor, at(12)), LeadValidationError, "a start time in the future");
  await assert.rejects(reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(10, 3), durationUnavailable: true }, w.rohanActor, at(12)), LeadNotFoundError, "another employee");
  const report = { startedAt: at(10, 3), durationUnavailable: true, classification: "CONNECTED", status: "CONNECTED" } as never;
  const { call } = await reportDeviceCall(w.repos, prepared.call.id, report, w.priyaActor, at(12));
  assert.equal(call.classification, null, "a classification sent by the client is simply not read");
  assert.equal(call.status, "COMPLETED");
});

// --- the bridge contract ------------------------------------------------------------------------------------------------

test("bridge: reports carry the unavailable flag; malformed ones are dropped; capabilities are read defensively", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const parsed = parsePendingReports(JSON.stringify([
    { callId: id, startedAtMs: 1_700_000_000_000, durationSeconds: 0, durationUnavailable: true, simRef: null },
    { callId: "not-a-uuid", startedAtMs: 1, durationSeconds: 1 },
    { callId: id.replace("1111", "2222"), startedAtMs: 1_700_000_000_000, durationSeconds: -3 },
    { callId: id.replace("1111", "3333"), startedAtMs: "x", durationUnavailable: true },
  ]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].durationUnavailable, true);
  assert.equal(parsed[0].durationSeconds, 0);

  const bridge = (caps?: string): DCDialerNative => ({ version: () => "9", hasPermissions: () => "true", requestPermissions() {}, startCall() {}, pendingReports: () => "[]", acknowledge() {}, ...(caps === undefined ? {} : { capabilities: () => caps }) });
  assert.deepEqual(readCapabilities(bridge(JSON.stringify({ canPlace: true, canMeasureDuration: false, durationSupported: false, version: "1.2" }))), { canPlace: true, canMeasureDuration: false, durationSupported: false, version: "1.2" });
  assert.equal(readCapabilities(bridge("not json")).canPlace, true, "a malformed answer falls back to the conservative reading");
  assert.equal(readCapabilities(bridge()).version, "9", "an older app without capabilities() still works");
});

// --- static: what the Android sources and manifests may and may not contain ----------------------------------------------

test("android: calls go through the official Telecom API, not a dialer intent; permission is requested in two separate, explicit steps", () => {
  const bridge = code(kotlin("DialerBridge.kt"));
  assert.match(bridge, /TelecomManager/);
  assert.match(bridge, /telecom\.placeCall\(Uri\.fromParts\(PhoneAccount\.SCHEME_TEL, phoneE164, null\), Bundle\(\)\)/);
  assert.doesNotMatch(bridge, /ACTION_CALL|ACTION_DIAL|startActivity\(/, "no dialer intent");
  assert.match(bridge, /fun requestCallPermission\(\)[\s\S]*arrayOf\(Manifest\.permission\.CALL_PHONE\)/);
  assert.match(bridge, /fun requestDurationPermission\(\)[\s\S]*if \(!BuildConfig\.CALL_LOG_ENABLED\) return[\s\S]*arrayOf\(Manifest\.permission\.READ_CALL_LOG\)/);
  assert.doesNotMatch(bridge.match(/fun requestPermissions\(\)[^\n]*/)?.[0] ?? "", /READ_CALL_LOG/, "the old entry point asks for CALL_PHONE only");
  assert.match(bridge, /if \(!canPlace\(\)\) \{\s*outbox\.add\(PendingReport\.notPlaced\(callId\)\)/);
  assert.match(bridge, /fun capabilities\(\)/);
});

test("android: no restricted or invasive permission is declared anywhere, and READ_CALL_LOG exists ONLY in the internal flavor", () => {
  const main = read("native-android/app/src/main/AndroidManifest.xml");
  const internal = read("native-android/app/src/internal/AndroidManifest.xml");
  const perms = (xml: string) => [...xml.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(perms(main), ["android.permission.CALL_PHONE", "android.permission.INTERNET"]);
  assert.deepEqual(perms(internal), ["android.permission.READ_CALL_LOG"]);
  for (const forbidden of ["WRITE_CALL_LOG", "PROCESS_OUTGOING_CALLS", "READ_PHONE_STATE", "READ_PHONE_NUMBERS", "READ_CONTACTS", "RECORD_AUDIO", "READ_SMS", "SEND_SMS", "BIND_INCALL_SERVICE", "MANAGE_OWN_CALLS", "ANSWER_PHONE_CALLS", "SYSTEM_ALERT_WINDOW"]) {
    for (const file of [main, internal, kotlin("DialerBridge.kt"), kotlin("CallLogReader.kt"), kotlin("MainActivity.kt"), kotlin("Outbox.kt")]) assert.doesNotMatch(code(file), new RegExp(forbidden), `${forbidden} must not appear`);
  }
  assert.doesNotMatch(main, /intent-filter>[\s\S]*DIAL|android\.intent\.category\.DEFAULT[\s\S]*tel/i, "the app is not registered as a phone/dialer handler");
  const gradle = read("native-android/app/build.gradle.kts");
  assert.match(gradle, /create\("internal"\)[\s\S]*CALL_LOG_ENABLED", "true"/);
  assert.match(gradle, /create\("play"\)[\s\S]*CALL_LOG_ENABLED", "false"/);
});

test("android: without call-log access the app never invents a length - it reports 'unavailable' - and it reads the log only for numbers it dialed", () => {
  const reader = code(kotlin("CallLogReader.kt"));
  assert.match(reader, /if \(!attempt\.measurable\)[\s\S]*PendingReport\.unmeasured/);
  assert.match(reader, /catch \(e: SecurityException\)[\s\S]*PendingReport\.unmeasured/);
  assert.match(reader, /CallLog\.Calls\.TYPE\} = \?/, "outgoing entries only");
  assert.match(reader, /endsWith\(tail\)/, "only the number this app dialed");
  assert.doesNotMatch(reader, /INCOMING_TYPE|MISSED_TYPE|CONTENT_FILTER_URI|CACHED_NAME/, "no incoming calls, no contact names");
  const outbox = code(kotlin("Outbox.kt"));
  assert.match(outbox, /fun unmeasured\(callId: String, startedAtMs: Long\) = PendingReport\(callId, startedAtMs, 0, null, null, android\.os\.Build\.MODEL, false, true\)/);
  assert.match(code(kotlin("MainActivity.kt")), /bridge\.onActivityResumed\(\)/);
});

test("android: the website asks for call-length access only after explaining it, and says so plainly when this build cannot", () => {
  const button = read("src/components/leads/call-button.tsx");
  assert.match(button, /requestCallPermission \?\? bridge\.requestPermissions/);
  assert.match(button, /Allow call-length recording/);
  assert.match(button, /read the length of the calls you place from it, and nothing else in your call history/);
  assert.match(button, /This version records that the call was placed, not how long it lasted/);
  assert.match(button, /Call attempted · length not recorded/);
  assert.doesNotMatch(button.match(/function place\(\)[\s\S]*?\n  }\n/)?.[0] ?? "", /requestDurationPermission/, "tapping Call never silently asks for call-log access");
});
