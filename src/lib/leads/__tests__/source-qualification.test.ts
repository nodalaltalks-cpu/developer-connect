import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead, changeLeadStatus, getLeadTimeline } from "../lead-service.ts";
import { createSelfGeneratedLead } from "../lead-import-service.ts";
import { EMPLOYEE_TRANSITIONS, OUTCOME_STATUS, QUALIFICATION_OUTCOMES, QUALIFICATION_REASONS, employeeMayMove, parseQualification, recordQualification } from "../qualification-service.ts";
import { contactBasisOf } from "../contact-basis.ts";
import { recordWhatsAppOpened } from "../whatsapp-service.ts";
import { describeTimeline } from "../timeline.ts";
import { leadSourceLabel } from "../lead-source.ts";
import { COLD_CALL_DETAILS, CREATION_METHODS, LEAD_STATUSES, coldCallDetailOf } from "../types.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4100 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const mine = await mk(1);
  const theirs = await mk(2);
  const unassigned = await mk(3);
  await assignLead(repos, staff, mine.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, theirs.id, rohan.id, FOUNDER, minutes(5));
  return { repos, mine, theirs, unassigned, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}
const at = (m: number) => minutes(m);
const events = async (repos: Awaited<ReturnType<typeof world>>["repos"], leadId: string) => (await getLeadTimeline(repos, leadId)).filter((e) => e.eventType === "STATUS_CHANGED" || e.eventType === "QUALIFICATION_RECORDED");

// --- the four outcomes map onto the canonical status model --------------------------------------------------------

test("mapping: the four qualification outcomes are existing statuses - there is no second status system", () => {
  assert.deepEqual(OUTCOME_STATUS, { QUALIFIED: "QUALIFIED", PENDING_QUALIFICATION: "CONTACTED", FUTURE_POTENTIAL: "REVISIT_LATER", NOT_LOOKING: "NOT_INTERESTED" });
  for (const status of Object.values(OUTCOME_STATUS)) assert.ok((LEAD_STATUSES as readonly string[]).includes(status));
  assert.deepEqual([...QUALIFICATION_REASONS], ["NEGOTIATION", "PROPERTY_PRESENTATION", "REQUIREMENT_GATHERING", "FINALIZED"]);
  assert.equal(QUALIFICATION_OUTCOMES.length, 4);
});

test("a team member's transitions are explicit: forward through the early pipeline or out to 'not now' - nothing later, nothing lost/booked/closed", () => {
  for (const [from, targets] of Object.entries(EMPLOYEE_TRANSITIONS)) {
    for (const to of targets ?? []) assert.ok(["CONTACTED", "QUALIFIED", "REVISIT_LATER", "NOT_INTERESTED"].includes(to), `${from} -> ${to}`);
  }
  for (const to of ["SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED", "LOST", "WRONG_NUMBER", "UNQUALIFIED", "DUPLICATE"] as const) {
    for (const from of LEAD_STATUSES) assert.equal(employeeMayMove(from, to), false, `${from} -> ${to} must not be a team member's move`);
  }
  for (const from of ["SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED", "LOST", "WRONG_NUMBER", "UNQUALIFIED", "DUPLICATE"] as const) {
    assert.equal(EMPLOYEE_TRANSITIONS[from], undefined, `a lead already at ${from} cannot be moved by a team member`);
  }
  assert.equal(employeeMayMove("QUALIFIED", "CONTACTED"), false, "no moving backwards");
  assert.equal(employeeMayMove("NOT_INTERESTED", "QUALIFIED"), false, "a closed-out lead is re-opened by the Founder, or by an explicit revisit");
});

test("input: outcome and reason are validated against fixed lists; a reason belongs to a qualified lead only", () => {
  assert.deepEqual(parseQualification({ outcome: "QUALIFIED", reason: "NEGOTIATION" }), { outcome: "QUALIFIED", reason: "NEGOTIATION" });
  assert.deepEqual(parseQualification({ outcome: "FUTURE_POTENTIAL" }), { outcome: "FUTURE_POTENTIAL", reason: null });
  for (const bad of [{ outcome: "BOOKED" }, { outcome: "qualified" }, { outcome: 7 }, { outcome: undefined }, { outcome: "QUALIFIED", reason: "BECAUSE" }, { outcome: "FUTURE_POTENTIAL", reason: "FINALIZED" }, { outcome: "QUALIFIED", reason: 3 }]) {
    assert.throws(() => parseQualification(bad as never), LeadValidationError, JSON.stringify(bad));
  }
});

// --- the service ----------------------------------------------------------------------------------------------------

test("employee: a lead they own moves NEW -> QUALIFIED with a reason; the status changes and TWO immutable events say who, what and why", async () => {
  const w = await world();
  const result = await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED", reason: "NEGOTIATION" }, w.priyaActor, at(10));
  assert.equal(result.statusChanged, true);
  assert.equal(result.lead.status, "QUALIFIED");
  const [statusEvent, qualEvent] = await events(w.repos, w.mine.id);
  assert.equal(statusEvent.eventType, "STATUS_CHANGED");
  assert.equal(statusEvent.fromStatus, "NEW");
  assert.equal(statusEvent.toStatus, "QUALIFIED");
  assert.equal(statusEvent.actorType, "EMPLOYEE");
  assert.equal(statusEvent.actorId, w.priyaActor.actorId);
  assert.equal(qualEvent.eventType, "QUALIFICATION_RECORDED");
  assert.deepEqual(qualEvent.payload, { outcome: "QUALIFIED", reason: "NEGOTIATION" });
  assert.equal(qualEvent.actorId, w.priyaActor.actorId);
  assert.equal(result.lead.status === "QUALIFIED" && !("reason" in result.lead), true, "the reason is context on the event; it never becomes the status");
});

test("employee: re-qualifying with a new reason keeps the status and records only the new qualification (history is appended, never rewritten)", async () => {
  const w = await world();
  await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED", reason: "REQUIREMENT_GATHERING" }, w.priyaActor, at(10));
  const second = await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED", reason: "NEGOTIATION" }, w.priyaActor, at(20));
  assert.equal(second.statusChanged, false);
  const list = await events(w.repos, w.mine.id);
  assert.deepEqual(list.map((e) => e.eventType), ["STATUS_CHANGED", "QUALIFICATION_RECORDED", "QUALIFICATION_RECORDED"]);
  assert.equal(list[1].payload.reason, "REQUIREMENT_GATHERING", "the earlier reason is still on record");
  assert.equal(list[2].payload.reason, "NEGOTIATION");
});

test("employee: pending / future / not-looking map to CONTACTED / REVISIT_LATER / NOT_INTERESTED", async () => {
  const w = await world();
  assert.equal((await recordQualification(w.repos, w.mine.id, { outcome: "PENDING_QUALIFICATION" }, w.priyaActor, at(10))).lead.status, "CONTACTED");
  assert.equal((await recordQualification(w.repos, w.mine.id, { outcome: "FUTURE_POTENTIAL" }, w.priyaActor, at(11))).lead.status, "REVISIT_LATER");
  assert.equal((await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED" }, w.priyaActor, at(12))).lead.status, "QUALIFIED");
  assert.equal((await recordQualification(w.repos, w.mine.id, { outcome: "NOT_LOOKING" }, w.priyaActor, at(13))).lead.status, "NOT_INTERESTED");
  assert.equal((await recordQualification(w.repos, w.mine.id, { outcome: "FUTURE_POTENTIAL" }, w.priyaActor, at(14))).lead.status, "REVISIT_LATER", "a not-interested lead may be put back to revisit");
});

test("employee: refused for a lead past qualification, a backward move, another member's lead, an unassigned lead and a non-team actor", async () => {
  const w = await world();
  await changeLeadStatus(w.repos, w.mine.id, "NEGOTIATION", FOUNDER, {}, at(8));
  await assert.rejects(recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED" }, w.priyaActor, at(10)), LeadStateError, "negotiation is the Founder's to move");
  await assert.rejects(recordQualification(w.repos, w.theirs.id, { outcome: "QUALIFIED" }, w.priyaActor, at(10)), LeadNotFoundError, "not their lead");
  await assert.rejects(recordQualification(w.repos, w.unassigned.id, { outcome: "QUALIFIED" }, w.priyaActor, at(10)), LeadNotFoundError, "Founder queue");
  await assert.rejects(recordQualification(w.repos, w.theirs.id, { outcome: "QUALIFIED" }, { actorType: "BUYER", actorId: "x" }, at(10)), UnauthorizedLeadActionError);
  assert.equal((await w.repos.leads.getById(w.theirs.id))!.status, "NEW");
  assert.equal((await events(w.repos, w.theirs.id)).length, 0, "a refused attempt leaves no trace on someone else's lead");
  await recordQualification(w.repos, w.theirs.id, { outcome: "QUALIFIED" }, w.rohanActor, at(11));
  await assert.rejects(recordQualification(w.repos, w.theirs.id, { outcome: "PENDING_QUALIFICATION" }, w.rohanActor, at(12)), LeadStateError, "QUALIFIED -> CONTACTED is backwards");
});

test("founder: not limited to the team member transitions, and changeLeadStatus remains Founder-only", async () => {
  const w = await world();
  await changeLeadStatus(w.repos, w.mine.id, "NEGOTIATION", FOUNDER, {}, at(8));
  const back = await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED", reason: "FINALIZED" }, FOUNDER, at(10));
  assert.equal(back.lead.status, "QUALIFIED");
  await assert.rejects(changeLeadStatus(w.repos, w.mine.id, "CONTACTED", w.priyaActor), UnauthorizedLeadActionError, "an employee still cannot use the unrestricted status change");
});

test("timeline: a qualification reads plainly and the reason shows as context beside the status", async () => {
  const w = await world();
  await recordQualification(w.repos, w.mine.id, { outcome: "QUALIFIED", reason: "PROPERTY_PRESENTATION" }, w.priyaActor, at(10));
  const lines = describeTimeline(await getLeadTimeline(w.repos, w.mine.id));
  assert.ok(lines.some((l) => /Qualification: qualified · property presentation/i.test(l.headline)), JSON.stringify(lines.map((l) => l.headline)));
  assert.ok(lines.some((l) => /Status: new → qualified/i.test(l.headline)));
});

// --- WhatsApp -----------------------------------------------------------------------------------------------------

test("whatsapp: only OPENED is recorded - never a sent message - and only for the lead's owner or the Founder", async () => {
  const w = await world();
  await recordWhatsAppOpened(w.repos, w.mine.id, w.priyaActor, at(10));
  const opened = (await getLeadTimeline(w.repos, w.mine.id)).filter((e) => e.eventType === "WHATSAPP_OPENED");
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].payload, {}, "no number, no text, nothing but the fact");
  const line = describeTimeline(opened)[0].headline;
  assert.match(line, /Opened WhatsApp/);
  assert.doesNotMatch(line, /sent|delivered|replied/i);
  await assert.rejects(recordWhatsAppOpened(w.repos, w.theirs.id, w.priyaActor, at(11)), LeadNotFoundError);
  await assert.rejects(recordWhatsAppOpened(w.repos, w.theirs.id, { actorType: "BUYER", actorId: "x" }, at(11)), UnauthorizedLeadActionError);
  await recordWhatsAppOpened(w.repos, w.theirs.id, FOUNDER, at(12));
  assert.equal(CREATION_METHODS.includes("DIALER_GENERATED"), true);
});

// --- source detail ---------------------------------------------------------------------------------------------------

test("cold-call detail: derived on the server from the creation method, so it can never disagree with the immutable creation record", async () => {
  assert.deepEqual([...COLD_CALL_DETAILS], ["SELF_GENERATED", "COLD_DATA", "REFERRAL", "MANUAL_DIAL", "IMPORTED_COLD_DATA"]);
  assert.equal(coldCallDetailOf("DIALER_GENERATED"), "MANUAL_DIAL");
  assert.equal(coldCallDetailOf("CSV_IMPORT"), "IMPORTED_COLD_DATA");
  assert.equal(coldCallDetailOf("EXCEL_IMPORT"), "IMPORTED_COLD_DATA");
  assert.equal(coldCallDetailOf("COLD_CALLING"), "COLD_DATA");
  assert.equal(coldCallDetailOf("REFERRAL_CREATED"), "REFERRAL");
  assert.equal(coldCallDetailOf("EMPLOYEE_CREATED"), "SELF_GENERATED");
  assert.equal(coldCallDetailOf("FOUNDER_CREATED"), "SELF_GENERATED");
  const repos = createInMemoryLeadRepositories();
  const made = await createSelfGeneratedLead(repos, { phone: "+91 98111 55001", creationMethod: "REFERRAL_CREATED" }, FOUNDER);
  assert.ok(made.created);
  assert.equal(made.lead.sourceType, "COLD_CALL");
  assert.equal(leadSourceLabel(made.lead), "Cold call · Referral");
  // A browser-supplied source is never read: the creation function has no such input.
  await assert.rejects(createSelfGeneratedLead(repos, { phone: "+91 98111 55002", creationMethod: "WEBSITE_GATE" as never }, FOUNDER), LeadValidationError);
});

// --- contact basis -----------------------------------------------------------------------------------------------------

test("contact basis: consent is only ever what the records show - cold-call and imported leads are UNKNOWN, never silently CONSENTED", () => {
  const cold = { sourceType: "COLD_CALL", creationMethod: "DIALER_GENERATED", erasedAt: null } as const;
  const imported = { sourceType: "COLD_CALL", creationMethod: "CSV_IMPORT", erasedAt: null } as const;
  const web = { sourceType: "DIGITAL", creationMethod: "WEBSITE_GATE", erasedAt: null } as const;
  assert.equal(contactBasisOf(cold, null).consent, "UNKNOWN");
  assert.equal(contactBasisOf(cold, null).basis, "OUTBOUND_COLD_CALL");
  assert.equal(contactBasisOf(imported, null).basis, "IMPORTED_LIST");
  assert.equal(contactBasisOf(web, { given: true, withdrawn: false }).consent, "CONSENTED");
  assert.equal(contactBasisOf(web, { given: true, withdrawn: true }).consent, "NOT_CONSENTED");
  assert.equal(contactBasisOf(web, null).consent, "UNKNOWN", "a website lead with no record is not assumed to have consented either");
  assert.equal(contactBasisOf({ ...cold, erasedAt: new Date() }, null).consent, "NOT_APPLICABLE");
  for (const view of [contactBasisOf(cold, null), contactBasisOf(imported, null)]) {
    assert.match(view.statement, /No consent record is held/);
    assert.doesNotMatch(view.statement, /compliant|compliance|lawful|legal basis|opted in|has consented/i);
  }
});

// --- static security ----------------------------------------------------------------------------------------------------

test("static: actions authorize first, take no status/owner/source from the browser, and the service reuses the shared guard", () => {
  const team = read("src/app/team/_actions/team-actions.ts");
  const admin = read("src/app/admin/_actions/lead-actions.ts");
  for (const [src, name] of [[team, "recordMyQualificationAction"], [team, "recordMyWhatsAppOpenedAction"], [admin, "recordLeadQualificationAction"], [admin, "recordLeadWhatsAppOpenedAction"]] as const) {
    const body = src.slice(src.indexOf(`export async function ${name}`), src.indexOf("\n}\n", src.indexOf(`export async function ${name}`)));
    assert.match(body, /return run\(leadId,/, `${name} goes through run(), which authorizes before anything else`);
    assert.doesNotMatch(body, /ownerId|sourceType|status:|actorId/, `${name} accepts nothing about owner, source or status`);
  }
  const service = read("src/lib/leads/qualification-service.ts");
  assert.match(service, /guardLeadAction\(tx, actor, lead, "QUALIFY_LEAD", now\)/);
  assert.match(service, /actor\.actorType === "EMPLOYEE" && !employeeMayMove/);
  assert.match(read("src/lib/leads/whatsapp-service.ts"), /guardLeadAction\(tx, actor, lead, "LOG_CONTACT", now\)/);
  const labels = read("src/lib/leads/timeline.ts");
  assert.doesNotMatch(labels.slice(labels.indexOf("WHATSAPP_OPENED")), /message sent|was sent|delivered/i);
});
