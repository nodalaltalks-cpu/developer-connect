import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignLead, captureAssistanceLead, changeLeadStatus, eraseLead, getLeadTimeline } from "../lead-service.ts";
import { createRequirement } from "../requirement-service.ts";
import { createProject, getLeadProjects, listProjectsForFounder, removeFromShortlist, shortlistProject, updateProject } from "../project-service.ts";
import { matchRequirementToProject, overallOf, rankMatches } from "../project-matching.ts";
import { changeSiteVisit, getLeadVisits, getVisitEvents, listOpenVisits, scheduleSiteVisit } from "../site-visit-service.ts";
import { advanceLeadStatus, PIPELINE_ORDER } from "../pipeline.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { getEmployeeInsights, resolveRange } from "../call-analytics.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, MissedFollowUpBlockError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadRequirement, Project } from "../types.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * Phase 4: explainable project matching, shortlist, site visits, pipeline movement and the contribution analytics -
 * against the in-memory repositories (same contracts as the PostgreSQL adapter, which has its own integration test).
 */

const DEV = "11111111-1111-4111-8111-111111111111";

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3600 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, b, free] = [await mk(1), await mk(2), await mk(3)];
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(5));
  // The in-memory lead repository resolves developer names from a lookup; register one so createProject can validate.
  const developerNames = repos.leads.developerNames;
  repos.leads.developerNames = async (ids: string[]) => ({ ...(await developerNames(ids)), ...Object.fromEntries(ids.filter((i) => i === DEV).map((i) => [i, "Acme Realty"])) });
  return { repos, staff, priya, rohan, a, b, free, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}
type World = Awaited<ReturnType<typeof world>>;

const project = (over: Partial<Parameters<typeof createProject>[1]> = {}) => ({ developerId: DEV, name: "Acme Heights", city: "Thane", locality: "Ghodbunder Road", propertyType: "Apartment", configurations: ["2 BHK", "3 BHK"], priceMin: 8_000_000, priceMax: 15_000_000, currency: "INR" as const, ...over });
const req = (over: Partial<LeadRequirement> = {}): LeadRequirement => ({ id: "r", leadId: "l", status: "ACTIVE", locations: ["Thane"], propertyType: "Apartment", configuration: "2 BHK", budgetMin: 7_000_000, budgetMax: 12_000_000, budgetCurrency: "INR", purpose: null, timeline: null, notes: null, createdBy: "x", updatedBy: "x", createdAt: T0, updatedAt: T0, ...over });
const proj = (over: Partial<Project> = {}): Project => ({ id: "p", developerId: DEV, name: "Acme Heights", city: "Thane", locality: "Ghodbunder Road", propertyType: "Apartment", configurations: ["2 BHK", "3 BHK"], priceMin: 8_000_000, priceMax: 15_000_000, currency: "INR", status: "ACTIVE", createdBy: "f", createdAt: T0, updatedAt: T0, ...over });
const result = (m: ReturnType<typeof matchRequirementToProject>, key: string) => m.criteria.find((c) => c.key === key)!.result;

// --- matching -------------------------------------------------------------------------------------

test("matching: every criterion is MATCH / MISMATCH / UNKNOWN with a reason, and overall is never optimistic", () => {
  const all = matchRequirementToProject(req(), proj());
  assert.deepEqual(all.criteria.map((c) => c.result), ["MATCH", "MATCH", "MATCH", "MATCH"]);
  assert.equal(all.overall, "MATCH");
  assert.ok(all.criteria.every((c) => c.reason.length > 10));

  assert.equal(result(matchRequirementToProject(req({ locations: ["Pune"] }), proj()), "location"), "MISMATCH");
  assert.equal(result(matchRequirementToProject(req({ locations: [] }), proj()), "location"), "UNKNOWN");
  assert.equal(result(matchRequirementToProject(req({ locations: ["Ghodbunder Road, Thane"] }), proj()), "location"), "MATCH", "a place inside the city counts");
  assert.equal(result(matchRequirementToProject(req({ propertyType: "Villa" }), proj()), "propertyType"), "MISMATCH");
  assert.equal(result(matchRequirementToProject(req(), proj({ propertyType: null })), "propertyType"), "UNKNOWN");
  assert.equal(result(matchRequirementToProject(req({ configuration: "4 BHK" }), proj()), "configuration"), "MISMATCH");
  assert.equal(result(matchRequirementToProject(req(), proj({ configurations: [] })), "configuration"), "UNKNOWN");
  assert.equal(result(matchRequirementToProject(req({ configuration: "2 bhk" }), proj()), "configuration"), "MATCH", "case-insensitive");
});

test("matching: budget overlaps are MATCH, gaps are MISMATCH, missing numbers are UNKNOWN, and currencies are NEVER converted", () => {
  assert.equal(result(matchRequirementToProject(req({ budgetMin: 1, budgetMax: 7_999_999 }), proj()), "budget"), "MISMATCH");
  assert.equal(result(matchRequirementToProject(req({ budgetMin: 15_000_001, budgetMax: null }), proj()), "budget"), "MISMATCH");
  assert.equal(result(matchRequirementToProject(req({ budgetMin: null, budgetMax: 8_000_000 }), proj()), "budget"), "MATCH", "touching ranges overlap");
  assert.equal(result(matchRequirementToProject(req({ budgetMin: null, budgetMax: null }), proj()), "budget"), "UNKNOWN");
  assert.equal(result(matchRequirementToProject(req(), proj({ priceMin: null, priceMax: null, currency: null })), "budget"), "UNKNOWN");
  const mixed = matchRequirementToProject(req({ budgetCurrency: "AED" }), proj());
  assert.equal(result(mixed, "budget"), "UNKNOWN");
  assert.match(mixed.criteria.find((c) => c.key === "budget")!.reason, /never converted/);
});

test("matching: overall = MISMATCH if any criterion mismatches, MATCH only if all match, otherwise UNKNOWN; ranking puts better fits first without a score", () => {
  assert.equal(overallOf([{ key: "location", label: "", result: "MATCH", reason: "" }, { key: "budget", label: "", result: "UNKNOWN", reason: "" }]), "UNKNOWN");
  assert.equal(overallOf([{ key: "location", label: "", result: "MISMATCH", reason: "" }, { key: "budget", label: "", result: "UNKNOWN", reason: "" }]), "MISMATCH");
  const good = proj({ id: "g", name: "B Good" });
  const unknown = proj({ id: "u", name: "A Unknown", propertyType: null });
  const bad = proj({ id: "b", name: "C Bad", city: "Pune", locality: null });
  const ranked = rankMatches([bad, unknown, good].map((p) => ({ project: p, match: matchRequirementToProject(req(), p) })));
  assert.deepEqual(ranked.map((r) => r.project.id), ["g", "u", "b"]);
  assert.equal("score" in ranked[0].match, false);
});

// --- projects (Founder-only inventory) ------------------------------------------------------------

test("projects: only the Founder creates or edits them; validation; no duplicates per developer; money needs a currency", async () => {
  const w = await world();
  await assert.rejects(createProject(w.repos, project(), w.priyaActor, minutes(10)), UnauthorizedLeadActionError);
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  assert.equal(p.status, "ACTIVE");
  await assert.rejects(createProject(w.repos, project({ name: "  acme heights " }), FOUNDER, minutes(11)), LeadStateError, "same developer, same name");
  await assert.rejects(createProject(w.repos, project({ name: "" }), FOUNDER), LeadValidationError);
  await assert.rejects(createProject(w.repos, project({ name: "X", priceMin: 10, priceMax: 5 }), FOUNDER), LeadValidationError);
  await assert.rejects(createProject(w.repos, project({ name: "X", currency: null }), FOUNDER), LeadValidationError, "a price needs its currency");
  await assert.rejects(createProject(w.repos, project({ name: "X", priceMin: -1 }), FOUNDER), LeadValidationError);
  await assert.rejects(createProject(w.repos, project({ name: "X", developerId: "22222222-2222-4222-8222-222222222222" }), FOUNDER), LeadValidationError, "unknown developer");
  await assert.rejects(updateProject(w.repos, p.id, { status: "INACTIVE" }, w.priyaActor), UnauthorizedLeadActionError);
  assert.equal((await updateProject(w.repos, p.id, { status: "INACTIVE" }, FOUNDER, minutes(12))).status, "INACTIVE");
  await assert.rejects(listProjectsForFounder(w.repos, w.priyaActor), UnauthorizedLeadActionError);
});

// --- shortlist ------------------------------------------------------------------------------------

async function withRequirement(w: World, leadId: string, actor = w.priyaActor) {
  return createRequirement(w.repos, leadId, { locations: ["Thane"], propertyType: "Apartment", configuration: "2 BHK", budgetMin: 7_000_000, budgetMax: 12_000_000, budgetCurrency: "INR" }, actor, minutes(8));
}

test("shortlist: matches are explainable, shortlisting moves the lead forward once, history is kept, and the buyer can be shortlisted again", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  await withRequirement(w, w.a.id);
  let view = await getLeadProjects(w.repos, w.priyaActor, w.a.id);
  assert.equal(view.matches[0].match.overall, "MATCH");
  assert.equal(view.matches[0].shortlisted, null);

  const entry = await shortlistProject(w.repos, w.a.id, p.id, w.priyaActor, minutes(20));
  assert.equal((await w.repos.leads.getById(w.a.id))?.status, "SHORTLISTED");
  await assert.rejects(shortlistProject(w.repos, w.a.id, p.id, w.priyaActor, minutes(21)), LeadStateError, "already shortlisted");
  const timeline = await getLeadTimeline(w.repos, w.a.id);
  assert.ok(timeline.some((e) => e.eventType === "PROJECT_SHORTLISTED"));
  assert.ok(timeline.some((e) => e.eventType === "STATUS_CHANGED" && e.toStatus === "SHORTLISTED" && e.actorType === "SYSTEM"));

  await removeFromShortlist(w.repos, w.a.id, entry.id, w.priyaActor, minutes(30));
  await assert.rejects(removeFromShortlist(w.repos, w.a.id, entry.id, w.priyaActor, minutes(31)), LeadStateError);
  const again = await shortlistProject(w.repos, w.a.id, p.id, w.priyaActor, minutes(40));
  assert.notEqual(again.id, entry.id, "a new entry; the old one stays as history");
  view = await getLeadProjects(w.repos, w.priyaActor, w.a.id);
  assert.equal(view.history.length, 2);
  assert.equal((await w.repos.leads.getById(w.a.id))?.status, "SHORTLISTED", "never moved back by removing");
});

test("shortlist: authorization - another employee, an unassigned lead, an inactive project, a foreign entry id and a buyer are all refused", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  await assert.rejects(shortlistProject(w.repos, w.a.id, p.id, w.rohanActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(shortlistProject(w.repos, w.free.id, p.id, w.priyaActor, minutes(20)), LeadNotFoundError);
  await assert.rejects(shortlistProject(w.repos, w.a.id, p.id, { actorType: "BUYER", actorId: "x" }, minutes(20)), UnauthorizedLeadActionError);
  await assert.rejects(getLeadProjects(w.repos, w.rohanActor, w.a.id), LeadNotFoundError);
  const entry = await shortlistProject(w.repos, w.a.id, p.id, w.priyaActor, minutes(20));
  // Rohan's own lead + Priya's entry id: the lead in the URL is not a way to reach another lead's entry.
  await assert.rejects(removeFromShortlist(w.repos, w.b.id, entry.id, w.rohanActor, minutes(25)), LeadNotFoundError);
  await updateProject(w.repos, p.id, { status: "INACTIVE" }, FOUNDER, minutes(26));
  await assert.rejects(shortlistProject(w.repos, w.b.id, p.id, FOUNDER, minutes(27)), LeadStateError);
});

// --- site visits ----------------------------------------------------------------------------------

test("site visit: scheduling needs a future time, an active project and ownership; it moves the lead to SITE_VISIT_SCHEDULED and is audited", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  const future = new Date(minutes(60).getTime());
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: minutes(5), projectId: p.id }, w.priyaActor, minutes(20)), LeadValidationError, "past");
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: new Date("nope") }, w.priyaActor, minutes(20)), LeadValidationError);
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: new Date(minutes(20).getTime() + 400 * 86400000) }, w.priyaActor, minutes(20)), LeadValidationError, "more than a year ahead");
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: future, projectId: "33333333-3333-4333-8333-333333333333" }, w.priyaActor, minutes(20)), LeadValidationError, "unknown project");
  await assert.rejects(scheduleSiteVisit(w.repos, w.b.id, { scheduledAt: future }, w.priyaActor, minutes(20)), LeadNotFoundError, "another member's lead");
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: future }, { actorType: "BUYER", actorId: "x" }, minutes(20)), UnauthorizedLeadActionError);

  const visit = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: future, projectId: p.id, notes: "Bring ID" }, w.priyaActor, minutes(20));
  assert.deepEqual([visit.status, visit.staffUserId, visit.createdBy], ["SCHEDULED", w.priya.userId, w.priya.userId]);
  assert.equal((await w.repos.leads.getById(w.a.id))?.status, "SITE_VISIT_SCHEDULED");
  const events = await w.repos.siteVisits.listEvents(visit.id);
  assert.deepEqual(events.map((e) => [e.eventType, e.toStatus, e.actorId]), [["SCHEDULED", "SCHEDULED", w.priya.userId]]);
  assert.doesNotMatch(JSON.stringify(events.map((e) => e.payload)), /Bring ID/, "free text never rides on an event");
  assert.ok((await getLeadTimeline(w.repos, w.a.id)).some((e) => e.eventType === "SITE_VISIT_SCHEDULED"));
  await assert.rejects(scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: new Date(future.getTime() + 3600000), projectId: p.id }, w.priyaActor, minutes(21)), LeadStateError, "one open visit per lead and project - reschedule instead");
});

test("site visit lifecycle: confirm, then complete only after its time; no-show; cancel; every step is auditable; finished visits are frozen", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  const at = minutes(60);
  const visit = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: at, projectId: p.id }, w.priyaActor, minutes(20));
  const confirmed = await changeSiteVisit(w.repos, visit.id, { kind: "CONFIRM" }, w.priyaActor, minutes(30));
  assert.deepEqual([confirmed.status, confirmed.confirmedAt?.getTime()], ["CONFIRMED", minutes(30).getTime()]);
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "CONFIRM" }, w.priyaActor, minutes(31)), LeadStateError, "already confirmed");
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "COMPLETE", outcome: "INTERESTED" }, w.priyaActor, minutes(40)), LeadStateError, "cannot complete a visit that has not happened");
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "NO_SHOW" }, w.priyaActor, minutes(40)), LeadStateError);
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "COMPLETE", outcome: "MAYBE" as never }, w.priyaActor, minutes(70)), LeadValidationError);

  const done = await changeSiteVisit(w.repos, visit.id, { kind: "COMPLETE", outcome: "NEGOTIATING", nextAction: "Send payment plan" }, w.priyaActor, minutes(70));
  assert.deepEqual([done.status, done.outcome, done.completedAt?.getTime()], ["COMPLETED", "NEGOTIATING", minutes(70).getTime()]);
  assert.equal((await w.repos.leads.getById(w.a.id))?.status, "SITE_VISIT_DONE");
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "CANCEL", reason: "OTHER" }, w.priyaActor, minutes(80)), LeadStateError, "finished visits are frozen");
  assert.deepEqual((await w.repos.siteVisits.listEvents(visit.id)).map((e) => e.eventType), ["SCHEDULED", "CONFIRMED", "COMPLETED"]);
  assert.deepEqual((await getVisitEvents(w.repos, w.priyaActor, visit.id)).map((e) => e.actorId), [w.priya.userId, w.priya.userId, w.priya.userId]);
  await assert.rejects(getVisitEvents(w.repos, w.rohanActor, visit.id), LeadNotFoundError);
});

test("site visit: reschedule closes the old visit and creates a new one that points back; cancel needs a reason; no-show after the time", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  const first = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: minutes(60), projectId: p.id }, w.priyaActor, minutes(20));
  await assert.rejects(changeSiteVisit(w.repos, first.id, { kind: "RESCHEDULE", scheduledAt: minutes(10) }, w.priyaActor, minutes(30)), LeadValidationError, "must be in the future");
  const second = await changeSiteVisit(w.repos, first.id, { kind: "RESCHEDULE", scheduledAt: minutes(120) }, w.priyaActor, minutes(30));
  assert.equal(second.rescheduledFrom, first.id);
  assert.equal((await w.repos.siteVisits.getById(first.id))?.status, "RESCHEDULED");
  assert.equal((await w.repos.siteVisits.listByLead(w.a.id)).length, 2, "both rows are kept");
  await assert.rejects(changeSiteVisit(w.repos, second.id, { kind: "CANCEL", reason: "NOPE" as never }, w.priyaActor, minutes(31)), LeadValidationError);
  const noShow = await changeSiteVisit(w.repos, second.id, { kind: "NO_SHOW" }, w.priyaActor, minutes(130));
  assert.equal(noShow.status, "NO_SHOW");
  const stats = await w.repos.siteVisits.statsByStaff(minutes(0), minutes(500));
  assert.deepEqual(stats[w.priya.userId], { scheduled: 1, completed: 0, noShow: 1 }, "a reschedule is not a new visit");
});

test("site visit authorization: another employee cannot see or change it, a visit cannot be reached through a different lead's id, and the open list is scoped", async () => {
  const w = await world();
  const visit = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: minutes(60) }, w.priyaActor, minutes(20));
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "CONFIRM" }, w.rohanActor, minutes(30)), LeadNotFoundError);
  await assert.rejects(changeSiteVisit(w.repos, visit.id, { kind: "CONFIRM" }, w.priyaActor, minutes(30), w.b.id), LeadNotFoundError, "wrong lead in the path");
  await assert.rejects(getLeadVisits(w.repos, w.rohanActor, w.a.id), LeadNotFoundError);
  assert.equal((await listOpenVisits(w.repos, w.rohanActor, minutes(30))).length, 0);
  assert.equal((await listOpenVisits(w.repos, w.priyaActor, minutes(30))).length, 1);
  assert.equal((await listOpenVisits(w.repos, FOUNDER, minutes(30))).length, 1);
  // The Founder may change any visit.
  assert.equal((await changeSiteVisit(w.repos, visit.id, { kind: "CONFIRM" }, FOUNDER, minutes(30))).status, "CONFIRMED");
});

test("missed-follow-up discipline still applies: an employee with an overdue follow-up on ANOTHER lead cannot shortlist or schedule", async () => {
  const w = await world();
  const second = (await captureAssistanceLead(w.repos, captureInput({ phone: "+91 98765 49999", name: "Buyer 9" }), T0)).lead;
  await assignLead(w.repos, w.staff, second.id, w.priya.id, FOUNDER, minutes(5));
  await scheduleFollowUp(w.repos, w.a.id, { scheduledAt: minutes(100) }, w.priyaActor, minutes(50));
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  await assert.rejects(scheduleSiteVisit(w.repos, second.id, { scheduledAt: minutes(500) }, w.priyaActor, minutes(200)), MissedFollowUpBlockError);
  await assert.rejects(shortlistProject(w.repos, second.id, p.id, w.priyaActor, minutes(200)), MissedFollowUpBlockError);
});

// --- pipeline -------------------------------------------------------------------------------------

test("pipeline: automatic movement is forward-only and never leaves a secondary state; manual statuses are unchanged", async () => {
  const w = await world();
  const lead = (await w.repos.leads.getById(w.a.id))!;
  assert.equal(await advanceLeadStatus(w.repos, lead, "SITE_VISIT_DONE", "TEST", minutes(20)), true);
  const moved = (await w.repos.leads.getById(w.a.id))!;
  assert.equal(await advanceLeadStatus(w.repos, moved, "SHORTLISTED", "TEST", minutes(21)), false, "never backwards");
  assert.equal(await advanceLeadStatus(w.repos, moved, "SITE_VISIT_DONE", "TEST", minutes(21)), false, "never sideways");
  await changeLeadStatus(w.repos, w.a.id, "LOST", FOUNDER, { reasonCode: "OTHER" }, minutes(25));
  assert.equal(await advanceLeadStatus(w.repos, (await w.repos.leads.getById(w.a.id))!, "NEGOTIATION", "TEST", minutes(26)), false, "a lost lead is never revived by the system");
  assert.deepEqual([...PIPELINE_ORDER], ["NEW", "CONTACTED", "QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"]);
});

// --- analytics ------------------------------------------------------------------------------------

test("contribution analytics: counts what people did with the denominators to read it fairly - no score, no rank, blanks instead of fake zeros", async () => {
  const w = await world();
  const p = await createProject(w.repos, project(), FOUNDER, minutes(10));
  await withRequirement(w, w.a.id);
  await shortlistProject(w.repos, w.a.id, p.id, w.priyaActor, minutes(20));
  const visit = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: minutes(60), projectId: p.id }, w.priyaActor, minutes(21));
  await changeSiteVisit(w.repos, visit.id, { kind: "COMPLETE", outcome: "INTERESTED" }, w.priyaActor, minutes(70));
  const now = minutes(100);
  const insights = await getEmployeeInsights(w.repos, w.staff, FOUNDER, { range: resolveRange("today", T0), period: "daily" }, now);
  const wide = await getEmployeeInsights(w.repos, w.staff, FOUNDER, { range: { from: minutes(0), to: minutes(1000), label: "test" } as never, period: "daily" }, now);
  const priya = wide.rows.find((r) => r.userId === w.priya.userId)!;
  const rohan = wide.rows.find((r) => r.userId === w.rohan.userId)!;
  assert.deepEqual([priya.contribution.requirementsCreated, priya.contribution.projectsShortlisted, priya.contribution.siteVisitsScheduled, priya.contribution.siteVisitsCompleted, priya.contribution.siteVisitsNoShow], [1, 1, 1, 1, 0]);
  assert.equal(priya.contribution.visitCompletionRate, 1);
  assert.equal(priya.contribution.ownedLeads, 1);
  assert.equal(priya.contribution.visitsPerConnectedCall, null, "no connected calls, so no ratio rather than a made-up 0");
  assert.equal(rohan.contribution.visitCompletionRate, null);
  assert.equal(rohan.contribution.leadsReachedShare, 0, "a person with leads and no calls is a real zero");
  for (const row of wide.rows) assert.equal("score" in row.contribution || "rank" in row.contribution, false);
  void insights;
});

// --- erasure --------------------------------------------------------------------------------------

test("erasure clears a visit's free text (notes, next action) and keeps the visit, its outcome and its audit trail", async () => {
  const w = await world();
  const visit = await scheduleSiteVisit(w.repos, w.a.id, { scheduledAt: minutes(60), notes: "Private note" }, w.priyaActor, minutes(20));
  await changeSiteVisit(w.repos, visit.id, { kind: "COMPLETE", outcome: "INTERESTED", nextAction: "Call the spouse" }, w.priyaActor, minutes(70));
  await eraseLead(w.repos, w.a.id, FOUNDER, minutes(80));
  const after = (await w.repos.siteVisits.getById(visit.id))!;
  assert.deepEqual([after.notes, after.nextAction, after.status, after.outcome], [null, null, "COMPLETED", "INTERESTED"]);
  assert.equal((await w.repos.siteVisits.listEvents(visit.id)).length, 2);
});

// --- static guarantees ----------------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: the employee capabilities are exactly the activity set plus shortlist, site visits and the narrow QUALIFY_LEAD - never unrestricted status, projects, assignment or revenue", () => {
  const access = read("src/lib/leads/lead-access.ts");
  const caps = access.match(/EMPLOYEE_CAPABILITIES = \[([^\]]*)\]/)![1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(caps, ["ADD_NOTE", "LOG_CONTACT", "SET_FOLLOW_UP", "COMPLETE_FOLLOW_UP", "MANAGE_REQUIREMENT", "RETURN_LEAD", "PLACE_CALL", "SHORTLIST_PROJECT", "MANAGE_SITE_VISIT", "QUALIFY_LEAD"]);
  const team = read("src/app/team/_actions/team-actions.ts");
  assert.doesNotMatch(team, /createProject|updateProject|createProjectAction/, "team members never edit inventory");
});

test("static: every new server action authorizes first - team actions through run(), founder project actions as their first statement", () => {
  const team = read("src/app/team/_actions/team-actions.ts");
  for (const name of ["shortlistMyProjectAction", "removeMyShortlistAction", "scheduleMySiteVisitAction", "changeMySiteVisitAction"]) {
    const body = team.slice(team.indexOf(`export async function ${name}(`));
    assert.match(body.slice(0, 400), /return run\(leadId,/, `${name} goes through run()`);
  }
  const admin = read("src/app/admin/_actions/lead-actions.ts");
  for (const name of ["createProjectAction", "setProjectStatusAction"]) {
    const body = admin.slice(admin.indexOf(`export async function ${name}(`));
    assert.match(body.slice(body.indexOf("{") + 1).trimStart(), /^const founderId = await requireFounderForAction\(\);/, `${name} authorizes the Founder first`);
  }
  for (const name of ["shortlistLeadProjectAction", "removeLeadShortlistAction", "scheduleLeadSiteVisitAction", "changeLeadSiteVisitAction"]) {
    const body = admin.slice(admin.indexOf(`export async function ${name}(`));
    assert.match(body.slice(0, 400), /return run\(leadId,/, `${name} goes through run()`);
  }
});

test("static: the Phase 4 pages are gated and noindex; migration 0023 is additive with immutability triggers", () => {
  for (const [file, gate] of [["src/app/admin/projects/page.tsx", "requireFounder"], ["src/app/admin/site-visits/page.tsx", "requireFounder"], ["src/app/team/visits/page.tsx", "requireEmployee"]] as const) {
    const text = read(file);
    assert.match(text, new RegExp(`await ${gate}\\(\\)`), `${file} gate`);
    assert.match(text, /robots: \{ index: false, follow: false \}/);
    assert.match(text, /export const dynamic = "force-dynamic"/);
  }
  const sql = read("src/lib/developer-connect/db/migrations/0023_phase4_projects_site_visits.sql");
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  assert.match(sql, /site_visit_events is append-only/);
  assert.match(sql, /a finished site visit cannot be changed/);
  assert.match(sql, /lead_project_shortlist: DELETE is not permitted/);
});
