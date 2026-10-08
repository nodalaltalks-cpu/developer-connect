import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead, changeLeadStatus, getLeadTimeline } from "../lead-service.ts";
import { createProject, searchActiveProjects } from "../project-service.ts";
import { saveColdCallLead } from "../cold-call-lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const DEV = "11111111-1111-4111-8111-111111111111";
const NEW_PHONE = "+91 98111 22334";
const NEW_E164 = "+919811122334";
const NOW = minutes(60);
const TOMORROW = new Date(NOW.getTime() + 24 * 3_600_000);

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number, name: string | null = `Buyer ${n}`) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4200 + n}`, name }), T0)).lead;
  const mine = await mk(1);
  const theirs = await mk(2);
  await assignLead(repos, staff, mine.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, theirs.id, rohan.id, FOUNDER, minutes(5));
  const developerNames = repos.leads.developerNames;
  repos.leads.developerNames = async (ids: string[]) => ({ ...(await developerNames(ids)), ...Object.fromEntries(ids.filter((i) => i === DEV).map((i) => [i, "Acme Realty"])) });
  const p1 = await createProject(repos, { developerId: DEV, name: "Acme Heights", city: "Thane", locality: "Ghodbunder Road", propertyType: "Apartment", configurations: ["2 BHK"] }, FOUNDER, minutes(10));
  const p2 = await createProject(repos, { developerId: DEV, name: "Acme Towers", city: "Mumbai", locality: "Worli", propertyType: "Apartment", configurations: ["3 BHK"] }, FOUNDER, minutes(11));
  const dormant = await createProject(repos, { developerId: DEV, name: "Acme Dormant", city: "Pune" }, FOUNDER, minutes(12));
  await repos.projects.update(dormant.id, { status: "INACTIVE" }, minutes(13));
  return { repos, mine, theirs, p1, p2, dormant, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}
type World = Awaited<ReturnType<typeof world>>;
const types = async (w: World, leadId: string) => (await getLeadTimeline(w.repos, leadId)).map((e) => e.eventType);

test("new lead, everything at once: one COLD_CALL lead owned by the caller, status = the qualification, projects as interest, requirement, next step and note", async () => {
  const w = await world();
  const result = await saveColdCallLead(w.repos, {
    phone: NEW_PHONE, name: "Asha Rao", email: "Asha@Example.com", interest: "INTERESTED",
    qualification: { outcome: "QUALIFIED", reason: "PROPERTY_PRESENTATION" },
    projectIds: [w.p1.id, w.p2.id],
    requirement: { locations: ["Thane"], configuration: "2 BHK", budgetMin: 7_000_000, budgetMax: 9_000_000, budgetCurrency: "INR", purpose: "SELF_USE", timeline: "ONE_TO_THREE_MONTHS" },
    plan: { kind: "CALL", scheduledAt: TOMORROW, note: "Share floor plans" },
    note: "Wants a south-facing flat.",
  }, w.priyaActor, NOW);
  assert.ok(result.saved);
  assert.equal(result.createdLead, true);
  assert.equal(result.projects, 2);
  assert.equal(result.planned, "CALL");

  const lead = (await w.repos.leads.getById(result.leadId))!;
  assert.equal(lead.phoneE164, NEW_E164);
  assert.equal(lead.name, "Asha Rao");
  assert.equal(lead.email, "asha@example.com");
  assert.equal(lead.sourceType, "COLD_CALL", "permanently a cold-call lead");
  assert.equal(lead.creationMethod, "COLD_CALLING");
  assert.equal(lead.ownerId, w.priyaActor.actorId);
  assert.equal(lead.createdBy, w.priyaActor.actorId);
  assert.equal(lead.status, "QUALIFIED", "interested projects never advance the pipeline past the employee's qualification");

  const shortlist = (await w.repos.shortlist.listByLead(lead.id)).filter((e) => e.removedAt === null);
  assert.deepEqual(shortlist.map((e) => e.projectId).sort(), [w.p1.id, w.p2.id].sort());
  assert.ok(shortlist.every((e) => e.shortlistedBy === w.priyaActor.actorId), "who added each project is preserved");
  const requirement = await w.repos.requirements.getActiveByLead(lead.id);
  assert.equal(requirement?.configuration, "2 BHK");
  const followUps = await w.repos.followUps.listByLead(lead.id);
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].type, "CALL_BACK");
  assert.equal(followUps[0].scheduledAt.getTime(), TOMORROW.getTime());
  assert.equal(followUps[0].note, "Share floor plans");
  const kinds = await types(w, lead.id);
  for (const expected of ["LEAD_CREATED", "STATUS_CHANGED", "QUALIFICATION_RECORDED", "REQUIREMENT_CREATED", "PROJECT_SHORTLISTED", "FOLLOW_UP_SET", "NOTE_ADDED"]) assert.ok(kinds.includes(expected as never), `${expected} missing from ${kinds.join(",")}`);
  assert.equal(kinds.filter((k) => k === "PROJECT_SHORTLISTED").length, 2);
});

test("ALL OR NOTHING: if any step fails, no lead, project, requirement, follow-up or event is left behind", async () => {
  const w = await world();
  const before = w.repos.snapshot();
  await assert.rejects(
    saveColdCallLead(w.repos, {
      phone: NEW_PHONE, name: "Asha Rao", interest: "INTERESTED", qualification: { outcome: "QUALIFIED" },
      projectIds: [w.p1.id, "22222222-2222-4222-8222-222222222222"], // the second project does not exist
      requirement: { configuration: "2 BHK" }, plan: { kind: "CALL", scheduledAt: TOMORROW }, note: "Should vanish",
    }, w.priyaActor, NOW),
    LeadNotFoundError,
  );
  const after = w.repos.snapshot();
  assert.equal(after.leads.length, before.leads.length, "the new lead was rolled back");
  assert.equal(after.events.length, before.events.length, "so were all its events");
  assert.equal(await w.repos.leads.findByPhone(NEW_E164), null);
});

test("not looking right now: recorded as NOT_INTERESTED with a note; projects, plan or requirement are refused rather than silently dropped", async () => {
  const w = await world();
  const saved = await saveColdCallLead(w.repos, { phone: NEW_PHONE, interest: "NOT_LOOKING", note: "Bought elsewhere." }, w.priyaActor, NOW);
  assert.ok(saved.saved);
  assert.equal((await w.repos.leads.getById(saved.leadId))!.status, "NOT_INTERESTED");
  assert.equal(saved.noteAdded, true);
  for (const extra of [{ projectIds: [w.p1.id] }, { plan: { kind: "CALL", scheduledAt: TOMORROW } }, { requirement: { configuration: "2 BHK" } }]) {
    await assert.rejects(saveColdCallLead(w.repos, { phone: "+91 98111 22999", interest: "NOT_LOOKING", ...extra }, w.priyaActor, NOW), LeadValidationError);
  }
  assert.equal(await w.repos.leads.findByPhone("+919811122999"), null);
});

test("duplicates: a number that exists is never created again and never described to someone it is not theirs", async () => {
  const w = await world();
  const yours = await saveColdCallLead(w.repos, { phone: w.mine.phoneE164, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" } }, w.priyaActor, NOW);
  assert.deepEqual(yours, { saved: false, reason: "EXISTS_YOURS", leadId: w.mine.id, leadName: "Buyer 1" });
  const notYours = await saveColdCallLead(w.repos, { phone: w.theirs.phoneE164, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, name: "Intruder" }, w.priyaActor, NOW);
  assert.deepEqual(notYours, { saved: false, reason: "EXISTS_NOT_YOURS" }, "nothing about the lead or its owner");
  assert.equal((await w.repos.leads.getById(w.theirs.id))!.name, "Buyer 2");
  assert.equal((await w.repos.leads.getById(w.mine.id))!.status, "NEW", "a duplicate attempt changes nothing");
  assert.equal(w.repos.snapshot().leads.length, 2);
});

test("an existing lead after a call: missing name/email are filled in, existing ones are never overwritten, and the fill-in is an event", async () => {
  const w = await world();
  const nameless = (await captureAssistanceLead(w.repos, captureInput({ phone: "+91 98765 49001", name: null, email: null }), T0)).lead;
  await w.repos.leads.update(nameless.id, { ownerId: w.priyaActor.actorId! }, minutes(3));
  const filled = await saveColdCallLead(w.repos, { leadId: nameless.id, name: "Neha Shah", email: "neha@example.com", interest: "INTERESTED", qualification: { outcome: "PENDING_QUALIFICATION" } }, w.priyaActor, NOW);
  assert.ok(filled.saved && !filled.createdLead);
  const lead = (await w.repos.leads.getById(nameless.id))!;
  assert.equal(lead.name, "Neha Shah");
  assert.equal(lead.email, "neha@example.com");
  assert.equal(lead.status, "CONTACTED");
  const detail = (await getLeadTimeline(w.repos, nameless.id)).find((e) => e.eventType === "CONTACT_DETAILS_UPDATED")!;
  assert.deepEqual(detail.payload, { fields: ["name", "email"] }, "field names only: the values never ride on an event");

  await saveColdCallLead(w.repos, { leadId: w.mine.id, name: "Someone Else", interest: "INTERESTED", qualification: { outcome: "QUALIFIED" } }, w.priyaActor, NOW);
  assert.equal((await w.repos.leads.getById(w.mine.id))!.name, "Buyer 1", "an existing name is never overwritten by this form");
});

test("existing lead: another member's lead looks absent, a lead past qualification is refused, and a refusal saves nothing", async () => {
  const w = await world();
  await assert.rejects(saveColdCallLead(w.repos, { leadId: w.theirs.id, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, note: "x" }, w.priyaActor, NOW), LeadNotFoundError);
  await changeLeadStatus(w.repos, w.mine.id, "NEGOTIATION", FOUNDER, {}, minutes(20));
  const before = w.repos.snapshot().events.length;
  await assert.rejects(saveColdCallLead(w.repos, { leadId: w.mine.id, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, note: "Will not be saved" }, w.priyaActor, NOW), LeadStateError);
  assert.equal(w.repos.snapshot().events.length, before, "not even the note survived");
  await assert.rejects(saveColdCallLead(w.repos, { leadId: "not-a-uuid", interest: "NOT_LOOKING" }, w.priyaActor, NOW), LeadNotFoundError);
  await assert.rejects(saveColdCallLead(w.repos, { phone: NEW_PHONE, interest: "NOT_LOOKING" }, { actorType: "BUYER", actorId: "x" }, NOW), UnauthorizedLeadActionError);
});

test("re-saving: projects already on the shortlist are skipped; an active requirement is updated, never duplicated", async () => {
  const w = await world();
  await saveColdCallLead(w.repos, { leadId: w.mine.id, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, projectIds: [w.p1.id], requirement: { configuration: "2 BHK" } }, w.priyaActor, NOW);
  const again = await saveColdCallLead(w.repos, { leadId: w.mine.id, interest: "INTERESTED", qualification: { outcome: "QUALIFIED", reason: "NEGOTIATION" }, projectIds: [w.p1.id, w.p2.id], requirement: { configuration: "3 BHK" } }, w.priyaActor, minutes(90));
  assert.ok(again.saved);
  assert.equal((await w.repos.shortlist.listByLead(w.mine.id)).filter((e) => e.removedAt === null).length, 2);
  const requirements = (await w.repos.requirements.listByLead(w.mine.id)).filter((r) => r.status === "ACTIVE");
  assert.equal(requirements.length, 1, "the one-active-requirement rule holds");
  assert.equal(requirements[0].configuration, "3 BHK");
});

test("a site visit plan uses the site-visit model and needs a project; meetings and video calls are follow-ups with a label", async () => {
  const w = await world();
  await assert.rejects(saveColdCallLead(w.repos, { phone: NEW_PHONE, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, plan: { kind: "SITE_VISIT", scheduledAt: TOMORROW } }, w.priyaActor, NOW), LeadValidationError);
  const visit = await saveColdCallLead(w.repos, { phone: NEW_PHONE, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, projectIds: [w.p1.id], plan: { kind: "SITE_VISIT", scheduledAt: TOMORROW, note: "Bring ID" } }, w.priyaActor, NOW);
  assert.ok(visit.saved && visit.planned === "SITE_VISIT");
  const visits = await w.repos.siteVisits.listByLead(visit.leadId);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].projectId, w.p1.id);
  assert.equal((await w.repos.followUps.listByLead(visit.leadId)).length, 0, "a site visit is not also a follow-up");

  const meeting = await saveColdCallLead(w.repos, { phone: "+91 98111 22555", interest: "INTERESTED", qualification: { outcome: "FUTURE_POTENTIAL" }, plan: { kind: "VIDEO_CALL", scheduledAt: TOMORROW, note: "Evening" } }, w.priyaActor, NOW);
  assert.ok(meeting.saved);
  const [followUp] = await w.repos.followUps.listByLead(meeting.leadId);
  assert.equal(followUp.type, "GENERAL_FOLLOW_UP");
  assert.equal(followUp.note, "Video call: Evening");
  assert.equal((await w.repos.leads.getById(meeting.leadId))!.status, "REVISIT_LATER");
});

test("validation: every input is checked against fixed lists before anything is written", async () => {
  const w = await world();
  const base = { phone: NEW_PHONE, interest: "INTERESTED", qualification: { outcome: "QUALIFIED" } };
  const bad: Array<[string, Record<string, unknown>]> = [
    ["interest", { interest: "MAYBE" }],
    ["interested without a qualification", { qualification: undefined }],
    ["interested with NOT_LOOKING", { qualification: { outcome: "NOT_LOOKING" } }],
    ["reason on a non-qualified lead", { qualification: { outcome: "PENDING_QUALIFICATION", reason: "FINALIZED" } }],
    ["unknown reason", { qualification: { outcome: "QUALIFIED", reason: "BECAUSE" } }],
    ["project ids not an array", { projectIds: "abc" }],
    ["project id not a uuid", { projectIds: ["Prestige Foo"] }],
    ["too many projects", { projectIds: Array.from({ length: 6 }, (_, i) => `33333333-3333-4333-8333-33333333333${i}`) }],
    ["plan kind", { plan: { kind: "TELEPATHY", scheduledAt: TOMORROW } }],
    ["plan time", { plan: { kind: "CALL", scheduledAt: "tomorrow" } }],
    ["email", { email: "not-an-email" }],
    ["name too long", { name: "x".repeat(500) }],
    ["phone", { phone: "12" }],
    ["note too long", { note: "x".repeat(5000) }],
  ];
  for (const [label, override] of bad) {
    await assert.rejects(saveColdCallLead(w.repos, { ...base, ...override } as never, w.priyaActor, NOW), LeadValidationError, label);
  }
  assert.equal(w.repos.snapshot().leads.length, 2, "no invalid request created a lead");
});

test("founder: may save a cold call too; the lead goes to the Founder queue (no owner)", async () => {
  const w = await world();
  const saved = await saveColdCallLead(w.repos, { phone: NEW_PHONE, interest: "INTERESTED", qualification: { outcome: "FUTURE_POTENTIAL" } }, FOUNDER, NOW);
  assert.ok(saved.saved);
  const lead = (await w.repos.leads.getById(saved.leadId))!;
  assert.equal(lead.ownerId, null);
  assert.equal(lead.creationMethod, "COLD_CALLING");
  assert.equal(lead.sourceType, "COLD_CALL");
});

test("project search: active projects only, by name / developer / place, no prices, nothing for a short query or a non-team caller", async () => {
  const w = await world();
  const hits = await searchActiveProjects(w.repos, w.priyaActor, "acme");
  assert.deepEqual(hits.map((h) => h.name).sort(), ["Acme Heights", "Acme Towers"], "the inactive project is not offered");
  assert.deepEqual(Object.keys(hits[0]).sort(), ["city", "developerName", "id", "locality", "name"], "ids and labels only");
  assert.deepEqual((await searchActiveProjects(w.repos, w.priyaActor, "worli")).map((h) => h.name), ["Acme Towers"]);
  assert.deepEqual((await searchActiveProjects(w.repos, w.priyaActor, "acme thane")).map((h) => h.name), ["Acme Heights"]);
  assert.deepEqual(await searchActiveProjects(w.repos, w.priyaActor, "a"), []);
  assert.deepEqual(await searchActiveProjects(w.repos, w.priyaActor, 42), []);
  await assert.rejects(searchActiveProjects(w.repos, { actorType: "BUYER", actorId: "x" }, "acme"), UnauthorizedLeadActionError);
});

test("static: the action authorizes first, accepts no owner/source/status from the browser; the service is one transaction", () => {
  const team = read("src/app/team/_actions/team-actions.ts");
  const start = team.indexOf("export async function saveMyColdCallLeadAction");
  const body = team.slice(start, team.indexOf("\n}\n", start));
  assert.ok(body.indexOf("requireEmployeeForAction()") >= 0 && body.indexOf("requireEmployeeForAction()") < body.indexOf("saveColdCallLead("));
  assert.doesNotMatch(body, /ownerId|sourceType|creationMethod|status:|createdBy/, "the browser decides none of these");
  assert.match(team, /export interface ColdCallFormPayload/);
  const payload = team.slice(team.indexOf("export interface ColdCallFormPayload"), team.indexOf("export type SaveColdCallResult"));
  assert.doesNotMatch(payload, /sourceType|ownerId|status|creationMethod|createdBy/);
  const service = read("src/lib/leads/cold-call-lead-service.ts");
  assert.match(service, /return repos\.transaction\(async \(tx\)/);
  assert.match(service, /advanceStatus: false/);
  assert.match(service, /creationMethod: "COLD_CALLING"/);
  const search = team.slice(team.indexOf("export async function searchMyProjectsAction"));
  assert.match(search.slice(0, 400), /requireEmployeeForAction\(\)/);
});
