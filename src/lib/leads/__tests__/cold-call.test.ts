import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead, getLeadTimeline } from "../lead-service.ts";
import { reportDeviceCall } from "../call-service.ts";
import { lookupColdCallNumber, parseColdCallNumber, prepareColdCall } from "../cold-call-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * Cold call: a typed number, called from the employee's own SIM, counted like any other call. In memory: this proves OUR
 * rules (no duplicate lead, no leak, ownership, the existing 10-second classification), not a real phone.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const NEW_NUMBER = "+91 98111 22334";
const NEW_E164 = "+919811122334";

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3900 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const mine = await mk(1);
  const theirs = await mk(2);
  const unassigned = await mk(3);
  await assignLead(repos, staff, mine.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, theirs.id, rohan.id, FOUNDER, minutes(5));
  return {
    repos, mine, theirs, unassigned,
    priyaActor: (await resolveEmployee(staff, priya.userId))!.actor,
    rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor,
  };
}
const at = (m: number, s = 0) => new Date(minutes(m).getTime() + s * 1000);

test("parse: typed numbers become E.164; junk is refused", () => {
  assert.deepEqual(parseColdCallNumber("98111 22334"), { ok: true, e164: NEW_E164 });
  assert.deepEqual(parseColdCallNumber("+919811122334"), { ok: true, e164: NEW_E164 });
  assert.deepEqual(parseColdCallNumber("+971 50 123 4567"), { ok: true, e164: "+971501234567" });
  for (const bad of ["", "abc", "123", "00000", "+91 12345", 12345, null, undefined, "9".repeat(40)]) assert.equal(parseColdCallNumber(bad).ok, false, `${String(bad)}`);
});

test("new number: is only a hidden PROSPECT with a call attempt - NOT a lead, in nobody's list, not classified yet", async () => {
  const w = await world();
  const prepared = await prepareColdCall(w.repos, { phone: NEW_NUMBER }, w.priyaActor, at(10));
  assert.equal(prepared.createdLead, false, "a cold call never creates a lead by itself");
  assert.equal(prepared.prospect, true);
  assert.equal(prepared.toE164, NEW_E164);
  assert.equal(prepared.call.method, "ANDROID_SIM");
  assert.equal(prepared.call.classification, null, "nothing is classified until the phone reports");
  assert.equal(prepared.call.staffUserId, w.priyaActor.actorId);
  const lead = (await w.repos.leads.findByPhone(NEW_E164))!;
  assert.equal(lead.id, prepared.leadId);
  assert.equal(lead.prospect, true);
  assert.equal(lead.ownerId, null, "a prospect belongs to nobody");
  assert.equal(lead.sourceType, "COLD_CALL");
  assert.equal(lead.creationMethod, "DIALER_GENERATED");
  const events = (await getLeadTimeline(w.repos, lead.id)).map((e) => e.eventType);
  assert.ok(events.includes("CALL_PLACED") && !events.includes("LEAD_CREATED"), "no lead was created");
  // Hidden everywhere leads are listed or counted.
  assert.ok(!(await w.repos.leads.listForQueue(100)).some((l) => l.id === lead.id), "not in the Founder's queue");
  const mine = await w.repos.leads.list({ view: "all", limit: 100, offset: 0, ownerId: w.priyaActor.actorId } as never).catch(() => null);
  if (mine) assert.ok(!mine.leads.some((l) => l.id === lead.id), "not in the member's lead list");
  // Anyone may call a prospect again: a colleague's call attaches to the same record.
  const other = await prepareColdCall(w.repos, { phone: NEW_NUMBER }, w.rohanActor, at(20));
  assert.equal(other.leadId, lead.id);
  assert.equal(other.call.staffUserId, w.rohanActor.actorId);
});

test("no silent duplicates: calling the same number again, or at the same moment, uses the one lead", async () => {
  const w = await world();
  const first = await prepareColdCall(w.repos, { phone: NEW_NUMBER }, w.priyaActor, at(10));
  const second = await prepareColdCall(w.repos, { phone: "098111 22334" }, w.priyaActor, at(11));
  assert.equal(second.leadId, first.leadId);
  assert.equal(second.createdLead, false);
  const both = await Promise.all([prepareColdCall(w.repos, { phone: "+91 98222 33445" }, w.priyaActor, at(12)), prepareColdCall(w.repos, { phone: "+91 98222 33445" }, w.priyaActor, at(12))]);
  assert.equal(both[0].leadId, both[1].leadId, "two simultaneous cold calls to one number use one record");
  assert.equal([...both].filter((b) => b.createdLead).length, 0, "and neither creates a lead");
});

test("existing lead of the caller: the call attaches to it, nothing is created", async () => {
  const w = await world();
  const prepared = await prepareColdCall(w.repos, { phone: w.mine.phoneE164 }, w.priyaActor, at(10));
  assert.equal(prepared.leadId, w.mine.id);
  assert.equal(prepared.createdLead, false);
  assert.equal(prepared.call.leadId, w.mine.id);
});

test("someone else's lead, or one in the Founder queue: refused, with no hint of whose it is or what it is called", async () => {
  const w = await world();
  for (const lead of [w.theirs, w.unassigned]) {
    await assert.rejects(prepareColdCall(w.repos, { phone: lead.phoneE164 }, w.priyaActor, at(10)), (error: unknown) => {
      assert.ok(error instanceof LeadStateError);
      assert.doesNotMatch((error as Error).message, /Rohan|Priya|Buyer|user_/);
      return true;
    });
    assert.deepEqual(await w.repos.calls.listByLead(lead.id), [], "no call attempt was created against it");
  }
  const lookup = await lookupColdCallNumber(w.repos, w.theirs.phoneE164, w.priyaActor, at(10));
  assert.deepEqual(lookup, { kind: "NOT_YOURS", e164: w.theirs.phoneE164 }, "the lookup reveals only that it exists and is not theirs");
});

test("lookup: new, yours, not yours, invalid - and the Founder may call any lead", async () => {
  const w = await world();
  assert.deepEqual(await lookupColdCallNumber(w.repos, NEW_NUMBER, w.priyaActor, at(10)), { kind: "NEW", e164: NEW_E164 });
  const yours = await lookupColdCallNumber(w.repos, w.mine.phoneE164, w.priyaActor, at(10));
  assert.equal(yours.kind, "YOURS");
  assert.equal(yours.kind === "YOURS" && yours.leadId, w.mine.id);
  assert.equal((await lookupColdCallNumber(w.repos, "nope", w.priyaActor, at(10))).kind, "INVALID");
  assert.equal((await lookupColdCallNumber(w.repos, w.theirs.phoneE164, FOUNDER, at(10))).kind, "YOURS");
  const founderCall = await prepareColdCall(w.repos, { phone: w.theirs.phoneE164 }, FOUNDER, at(11));
  assert.equal(founderCall.leadId, w.theirs.id);
});

test("only signed-in team members: a buyer or anonymous caller is refused before anything is read or created", async () => {
  const w = await world();
  await assert.rejects(prepareColdCall(w.repos, { phone: NEW_NUMBER }, { actorType: "BUYER", actorId: "x" }, at(10)), UnauthorizedLeadActionError);
  await assert.rejects(lookupColdCallNumber(w.repos, NEW_NUMBER, { actorType: "BUYER", actorId: "x" }, at(10)), UnauthorizedLeadActionError);
  assert.equal(await w.repos.leads.findByPhone(NEW_E164), null);
  await assert.rejects(prepareColdCall(w.repos, { phone: "12" }, w.priyaActor, at(10)), LeadValidationError);
  assert.equal(await w.repos.leads.findByPhone("+9112"), null);
});

test("after the call: the EXISTING path classifies it - 10 seconds is DIALED, 11 is CONNECTED, on the right lead and employee", async () => {
  const w = await world();
  for (const [seconds, expected, phone] of [[10, "DIALED", "+91 98333 44556"], [11, "CONNECTED", "+91 98444 55667"]] as const) {
    const prepared = await prepareColdCall(w.repos, { phone }, w.priyaActor, at(20));
    const { call } = await reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(20, 3), durationSeconds: seconds, simRef: "1", callLogRef: "9", deviceRef: "Pixel" }, w.priyaActor, at(20, seconds + 60));
    assert.equal(call.classification, expected);
    assert.equal(call.leadId, prepared.leadId);
    assert.equal(call.staffUserId, w.priyaActor.actorId);
    await assert.rejects(reportDeviceCall(w.repos, prepared.call.id, { startedAt: at(20, 3), durationSeconds: 99, notPlaced: false }, w.rohanActor, at(25)), "another employee cannot report it");
  }
});

test("static: the action authorizes the employee first, takes only a number, and decides nothing the browser could influence", () => {
  const actions = read("src/app/team/_actions/team-actions.ts");
  const block = actions.slice(actions.indexOf("export async function prepareMyColdCallAction"), actions.indexOf("export interface DeviceReportInput"));
  assert.match(block, /requireEmployeeForAction\(\)/);
  assert.ok(block.indexOf("requireEmployeeForAction()") < block.indexOf("prepareColdCall("));
  assert.match(block, /prepareMyColdCallAction\(phone: string, deviceRef\?: string \| null\)/);
  assert.doesNotMatch(block, /classification|status|ownerId|actorId:|durationSeconds/, "no owner, status, classification or duration comes from the browser");
  const service = read("src/lib/leads/cold-call-service.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(service, /classifyCallDuration|CONNECTED_THRESHOLD/, "the cold-call service classifies nothing");
  assert.match(service, /prepareDeviceCall\(/);
  assert.match(service, /prospect: true/, "a new number is kept as a hidden prospect, not created as a lead");
  assert.doesNotMatch(service, /createSelfGeneratedLead\(/);
});

test("static: the screen is team-only, mobile-sized, and honest in an ordinary browser", () => {
  assert.match(read("src/app/team/dial/page.tsx"), /requireTab\("dial"\)/);
  const pad = read("src/components/team/cold-call-pad.tsx");
  assert.match(pad, /min-h-14/, "keypad keys are at least 56px");
  assert.match(pad, /grid-cols-3/);
  assert.match(pad, /reportMyBrowserCallAction/, "in a phone browser the call is still recorded server-side (placed, no length)");
  assert.doesNotMatch(pad, /href=\{`tel:|telHref=\{`|href="tel:/, "no untracked tel: call is ever offered");
  assert.match(pad, /prepareMyColdCallAction/);
  assert.match(pad, /lookupMyColdCallNumberAction/);
  const nav = read("src/components/team/team-nav.tsx");
  assert.match(read("src/lib/staff/tab-access.ts"), /key: "dial", label: "Dial", href: "\/team\/dial"/);
  assert.match(nav, /PHONE_BAR = new Set\(\["leads", "queue", "dial", "follow-ups", "calls"\]\)/, "the phone bar has exactly five items");
});

test("static: the Android app nudges the page the moment the employee comes back, with no new permission", () => {
  const main = read("native-android/app/src/main/java/com/developerconnects/dialer/MainActivity.kt");
  assert.match(main, /override fun onResume\(\)/);
  assert.match(main, /dc:app-resumed/);
  const manifest = read("native-android/app/src/main/AndroidManifest.xml");
  const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(permissions, ["android.permission.CALL_PHONE", "android.permission.INTERNET"], "the main manifest declares only these two (call-log access lives only in the internal flavor)");
  const sync = read("src/components/team/device-call-sync.tsx");
  assert.match(sync, /dc:app-resumed/);
  assert.match(sync, /for \(const ms of \[1200, 3000, 6000\]\)/);
});
