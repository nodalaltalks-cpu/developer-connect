import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDaysTo, describeWhen, monthGrid } from "../leads/when-input.tsx";
import { countryReady, dialCode, maxDigits, minDigits } from "../team/country-code-field.tsx";
import { assignLead, captureAssistanceLead } from "../../lib/leads/lead-service.ts";
import { reportDeviceCall } from "../../lib/leads/call-service.ts";
import { finishColdCall } from "../../lib/leads/cold-call-outcome-service.ts";
import { lookupColdCallNumber, prepareColdCall } from "../../lib/leads/cold-call-service.ts";
import { saveColdCallLead } from "../../lib/leads/cold-call-lead-service.ts";
import { getMyCallDashboard } from "../../lib/leads/call-analytics.ts";
import { createInMemoryLeadRepositories } from "../../lib/leads/memory-repository.ts";
import { LeadValidationError } from "../../lib/leads/errors.ts";
import { createInMemoryStaffRepository } from "../../lib/staff/memory-repository.ts";
import { addStaffMember } from "../../lib/staff/staff-service.ts";
import { resolveEmployee } from "../../lib/staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "../../lib/leads/__tests__/test-helpers.ts";

/**
 * The cold-call rules the Founder set: a cold call is NOT a lead. It is recorded and counted (every synced call = one dialed; more
 * than 10 seconds of measured talk time = also connected). "Not interested" is a few words and nothing else; "did not connect" is one
 * tap; only "interested" (with the short details) makes a lead, owned by the employee who qualified it. Anyone may call a prospect again.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../..", relative), "utf8");
const NUMBER = "+91 98111 22334";
const E164 = "+919811122334";
const at = (m: number, s = 0) => new Date(minutes(m).getTime() + s * 1000);

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const theirs = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43999", name: "Existing buyer" }), T0)).lead;
  await assignLead(repos, staff, theirs.id, rohan.id, FOUNDER, minutes(5));
  return { repos, theirs, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}

/** A cold call that the phone synced with a measured length (or none). */
async function syncedCall(w: Awaited<ReturnType<typeof world>>, actor: Awaited<ReturnType<typeof world>>["priyaActor"], number: string, seconds: number | "unavailable", minute: number) {
  const prepared = await prepareColdCall(w.repos, { phone: number }, actor, at(minute));
  const report = seconds === "unavailable" ? { startedAt: at(minute, 2), durationUnavailable: true } : { startedAt: at(minute, 2), durationSeconds: seconds };
  const { call } = await reportDeviceCall(w.repos, prepared.call.id, report, actor, at(minute, 3 + (seconds === "unavailable" ? 0 : seconds)));
  return { prepared, call };
}

test("counting: every synced call is one DIALED call; more than 10 seconds of measured talk time is also CONNECTED; an unmeasured call is dialed, never connected", async () => {
  const w = await world();
  await syncedCall(w, w.priyaActor, NUMBER, 5, 10); // 5 s: dialed
  await syncedCall(w, w.priyaActor, NUMBER, 10, 20); // exactly 10 s: dialed
  await syncedCall(w, w.priyaActor, NUMBER, 11, 30); // 11 s: connected
  await syncedCall(w, w.priyaActor, NUMBER, "unavailable", 40); // browser call: dialed only
  const dash = await getMyCallDashboard(w.repos, w.priyaActor, at(120), { range: "today" });
  assert.equal(dash.metrics.dialed, 4, "all four synced calls count as dialed");
  assert.equal(dash.metrics.connected, 1, "only the 11-second call is connected");
});

test("not interested: saved with a few words and NOTHING else - no name, no lead, the number stays a hidden prospect anyone can call again", async () => {
  const w = await world();
  const { prepared, call } = await syncedCall(w, w.priyaActor, NUMBER, 25, 10);
  const done = await finishColdCall(w.repos, call.id, { outcome: "NOT_INTERESTED", comment: "Already bought elsewhere" }, w.priyaActor, at(12));
  assert.equal(done.disposition, "NOT_INTERESTED");
  const prospect = (await w.repos.leads.findByPhone(E164))!;
  assert.equal(prospect.id, prepared.leadId);
  assert.equal(prospect.prospect, true, "still not a lead");
  assert.equal(prospect.ownerId, null);
  assert.equal(prospect.name, null);
  const notes = (await w.repos.events.listByLead(prospect.id)).filter((e) => e.eventType === "NOTE_ADDED");
  assert.equal(notes.length, 1, "the comment is kept with its time");
  assert.equal(notes[0].payload.text, "Already bought elsewhere");
  // The number is "new" for everyone, including the same employee: it can be called again and again.
  assert.equal((await lookupColdCallNumber(w.repos, NUMBER, w.priyaActor, at(15))).kind, "NEW");
  assert.equal((await lookupColdCallNumber(w.repos, NUMBER, w.rohanActor, at(15))).kind, "NEW");
  const again = await prepareColdCall(w.repos, { phone: NUMBER }, w.rohanActor, at(20));
  assert.equal(again.leadId, prospect.id);
  assert.equal(again.prospect, true);
  // A comment is required, but only a few characters.
  const second = await syncedCall(w, w.priyaActor, NUMBER, 12, 30);
  await assert.rejects(finishColdCall(w.repos, second.call.id, { outcome: "NOT_INTERESTED", comment: "" }, w.priyaActor, at(32)), LeadValidationError);
});

test("did not connect: one tap, with the reason recorded and no comment needed", async () => {
  const w = await world();
  const { call } = await syncedCall(w, w.priyaActor, NUMBER, "unavailable", 10);
  const done = await finishColdCall(w.repos, call.id, { outcome: "NOT_CONNECTED", reason: "NO_ANSWER" }, w.priyaActor, at(12));
  assert.equal(done.disposition, "NO_ANSWER");
  const text = (await w.repos.events.listByLead(call.leadId)).filter((e) => e.eventType === "NOTE_ADDED")[0].payload.text;
  assert.equal(text, "Did not connect: No answer");
  const next = await syncedCall(w, w.priyaActor, "+91 98111 55667", "unavailable", 20);
  await assert.rejects(finishColdCall(w.repos, next.call.id, { outcome: "NOT_CONNECTED", reason: "MADE_UP" }, w.priyaActor, at(22)), LeadValidationError);
});

test("only the employee who made the call can end it, and a real lead is not ended this way", async () => {
  const w = await world();
  const { call } = await syncedCall(w, w.priyaActor, NUMBER, 25, 10);
  await assert.rejects(finishColdCall(w.repos, call.id, { outcome: "NOT_INTERESTED", comment: "Not looking" }, w.rohanActor, at(12)));
  const real = await prepareColdCall(w.repos, { phone: "+91 98765 43999" }, w.rohanActor, at(20)); // Rohan's own lead
  assert.equal(real.prospect, false);
});

test("interested: saving the short details makes it THAT employee's lead, keeping every call already made to the number", async () => {
  const w = await world();
  const first = await syncedCall(w, w.rohanActor, NUMBER, 4, 5); // a colleague called it earlier
  const { prepared } = await syncedCall(w, w.priyaActor, NUMBER, 40, 10);
  assert.equal(prepared.leadId, first.prepared.leadId, "one record for the number");
  const saved = await saveColdCallLead(
    w.repos,
    { leadId: prepared.leadId, name: "Asha", interest: "INTERESTED", qualification: { outcome: "PENDING_QUALIFICATION" }, requirement: { locations: ["Mumbai"], budgetMin: 10_000_000, budgetMax: 20_000_000, budgetCurrency: "INR", configuration: "2 BHK", timeline: "ONE_TO_THREE_MONTHS" }, note: "Wants to see two projects this month" },
    w.priyaActor,
    at(12),
  );
  assert.equal(saved.saved, true);
  const lead = (await w.repos.leads.findByPhone(E164))!;
  assert.equal(lead.prospect, false, "now a lead");
  assert.equal(lead.ownerId, w.priyaActor.actorId, "owned by the employee who qualified it");
  assert.equal(lead.name, "Asha");
  assert.equal((await w.repos.calls.listByLead(lead.id)).length, 2, "both calls are on it");
  const events = (await w.repos.events.listByLead(lead.id)).map((e) => e.eventType);
  assert.ok(events.includes("LEAD_CREATED") && events.includes("OWNER_CHANGED"));
  // Now it is a real lead: someone else can no longer call it.
  assert.equal((await lookupColdCallNumber(w.repos, NUMBER, w.rohanActor, at(30))).kind, "NOT_YOURS");
  assert.equal((await lookupColdCallNumber(w.repos, NUMBER, w.priyaActor, at(30))).kind, "YOURS");
});

test("a number typed without calling (the add-a-lead page) also qualifies the existing prospect instead of creating another", async () => {
  const w = await world();
  await syncedCall(w, w.priyaActor, NUMBER, 3, 10);
  const saved = await saveColdCallLead(w.repos, { phone: NUMBER, name: "Ravi", interest: "INTERESTED", qualification: { outcome: "PENDING_QUALIFICATION" }, note: "Spoke at the site" }, w.priyaActor, at(15));
  assert.equal(saved.saved, true);
  const lead = (await w.repos.leads.findByPhone(E164))!;
  assert.equal(lead.prospect, false);
  assert.equal(lead.ownerId, w.priyaActor.actorId);
  assert.equal((await w.repos.calls.listByLead(lead.id)).length, 1);
});

test("a website capture of a number that was only a prospect makes it a visible lead", async () => {
  const w = await world();
  await syncedCall(w, w.priyaActor, NUMBER, 3, 10);
  const captured = await captureAssistanceLead(w.repos, captureInput({ phone: NUMBER, name: "Web visitor" }), at(30));
  assert.equal(captured.lead.prospect, false);
});

test("country code: India and UAE are one tap, any other country can be typed", () => {
  assert.equal(dialCode({ key: "IN", custom: "" }), "+91");
  assert.equal(dialCode({ key: "AE", custom: "" }), "+971");
  assert.equal(dialCode({ key: "OTHER", custom: "44" }), "+44");
  assert.equal(countryReady({ key: "OTHER", custom: "" }), false, "another country needs its code");
  assert.equal(countryReady({ key: "OTHER", custom: "1" }), true);
  assert.equal(minDigits({ key: "IN", custom: "" }), 10);
  assert.ok(maxDigits({ key: "OTHER", custom: "44" }) > maxDigits({ key: "IN", custom: "" }));
  assert.equal(read("src/components/team/country-code-field.tsx").includes("Other country"), true);
});

test("calendar: weekday names, Monday-first month grid and day arithmetic are exact", () => {
  assert.equal(describeWhen("2026-10-10T10:00")?.text, "Saturday, 10 October 2026 · 10:00 AM");
  assert.equal(addDaysTo("2026-10-30", 3), "2026-11-02");
  assert.equal(addDaysTo("2026-12-31", 1), "2027-01-01");
  const oct = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday: three blanks (Mon, Tue, Wed) then 1..31
  assert.deepEqual(oct.slice(0, 4), [null, null, null, 1]);
  assert.equal(oct.filter((d) => d !== null).length, 31);
  assert.equal(monthGrid(2028, 2).filter((d) => d !== null).length, 29, "leap year");
  const picker = read("src/components/leads/when-input.tsx");
  assert.match(picker, /"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"/);
  assert.doesNotMatch(picker, /type="datetime-local"/);
});

test("wiring: the pad shows the quick outcome panel, the manual page uses the short form, and returning a lead leaves the page it would 404 on", () => {
  const pad = read("src/components/team/cold-call-pad.tsx");
  assert.match(pad, /<ColdCallResult/);
  assert.match(pad, /CountryCodeField/);
  assert.match(read("src/components/team/cold-call-result.tsx"), /Not interested[\s\S]*Did not connect|Interested[\s\S]*Not interested/);
  assert.match(read("src/app/team/cold-call/page.tsx"), /QuickLeadScreen askPhone/);
  assert.match(read("src/components/team/quick-lead-form.tsx"), /NA/);
  const actions = read("src/app/team/_actions/team-actions.ts");
  assert.match(actions, /"\/team\?returned=1"/, "returning a lead redirects to My leads instead of re-rendering a lead page the member no longer owns");
  assert.match(actions, /redirect\(thenGoTo\)/);
});
