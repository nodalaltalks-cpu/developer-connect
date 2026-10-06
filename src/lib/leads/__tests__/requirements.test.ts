import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLead, captureAssistanceLead, eraseLead, getLeadTimeline } from "../lead-service.ts";
import {
  createRequirement,
  currentRequirement,
  listRequirementsForActor,
  setRequirementStatus,
  updateRequirementDetails,
  validateRequirementInput,
} from "../requirement-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { getLeadDetail, getMyLeadDetail } from "../lead-reads.ts";
import { describeTimeline } from "../timeline.ts";
import { redactPayload } from "../redaction.ts";
import { locationKey, normalizeLocations } from "../requirement-locations.ts";
import { toMatchableRequirement } from "../matching.ts";
import { prefillFromLead, splitRequirements, toRequirementView } from "../requirement-view.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember, setStaffActive } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import type { LeadActor, RequirementInput } from "../types.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Buyer requirements (Phase 2, Step 3): model, history, validation, authorization — in memory, no database. */

const FULL: RequirementInput = {
  locations: ["Thane", "Navi Mumbai"],
  propertyType: "Apartment",
  configuration: "2 BHK",
  budgetMin: 8_000_000,
  budgetMax: 12_000_000,
  budgetCurrency: "INR",
  purpose: "SELF_USE",
  timeline: "ONE_TO_THREE_MONTHS",
  notes: "Wants to be near the station",
};

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3300 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, rohan.id, FOUNDER, minutes(5));
  const priyaActor = (await resolveEmployee(staff, priya.userId))!.actor;
  const rohanActor = (await resolveEmployee(staff, rohan.userId))!.actor;
  return { repos, staff, priya, rohan, a, b, c, priyaActor, rohanActor };
}

const events = async (repos: Awaited<ReturnType<typeof world>>["repos"], leadId: string, type: string) =>
  (await getLeadTimeline(repos, leadId)).filter((e) => e.eventType === type);

test("create: the founder creates a requirement — ACTIVE, all fields stored, who/when recorded, one REQUIREMENT_CREATED event", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  assert.equal(r.status, "ACTIVE");
  assert.deepEqual(r.locations, ["Thane", "Navi Mumbai"]);
  assert.equal(r.budgetMin, 8_000_000);
  assert.equal(r.budgetCurrency, "INR");
  assert.equal(r.createdBy, FOUNDER.actorId);
  assert.equal(r.updatedBy, FOUNDER.actorId);
  assert.equal(r.createdAt.getTime(), minutes(10).getTime());
  const created = await events(repos, c.id, "REQUIREMENT_CREATED");
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].payload, { requirementId: r.id });
  assert.equal(created[0].actorType, "FOUNDER");
});

test("create: the active requirement is mirrored onto the lead, so the card, queue and Founder CRM keep reading the same columns", async () => {
  const { repos, c } = await world();
  await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  const lead = (await repos.leads.getById(c.id))!;
  assert.equal(lead.location, "Thane, Navi Mumbai");
  assert.equal(lead.budgetMax, 12_000_000);
  assert.equal(lead.configuration, "2 BHK");
  assert.equal(lead.purpose, "SELF_USE");
  assert.equal(lead.timeline, "ONE_TO_THREE_MONTHS");
  assert.equal(lead.lastActivityAt.getTime(), minutes(10).getTime());
});

test("update: only what changed is recorded; locations and notes are flagged but their TEXT is never put in the event", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  const { requirement, changed } = await updateRequirementDetails(
    repos,
    c.id,
    r.id,
    { ...FULL, budgetMax: 15_000_000, locations: ["Thane", "Mumbai"], notes: "Now wants a lift" },
    FOUNDER,
    minutes(20),
  );
  assert.deepEqual(changed.sort(), ["budgetMax", "locations", "notes"]);
  assert.equal(requirement.budgetMax, 15_000_000);
  assert.deepEqual(requirement.locations, ["Thane", "Mumbai"]);
  assert.equal(requirement.updatedBy, FOUNDER.actorId);
  const [event] = await events(repos, c.id, "REQUIREMENT_UPDATED");
  assert.deepEqual(event.payload, {
    requirementId: r.id,
    fields: { budgetMax: { from: 12_000_000, to: 15_000_000 }, locations: { changed: true }, notes: { changed: true } },
  });
  const text = JSON.stringify(await getLeadTimeline(repos, c.id));
  for (const secret of ["Navi Mumbai", "Wants to be near the station", "Now wants a lift"]) assert.ok(!text.includes(secret), `${secret} must not appear in any event`);
  assert.equal((await repos.leads.getById(c.id))?.budgetMax, 15_000_000, "mirror follows the update");
});

test("update: a no-op writes nothing — no event, no timestamp change", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  const before = (await getLeadTimeline(repos, c.id)).length;
  const result = await updateRequirementDetails(repos, c.id, r.id, FULL, FOUNDER, minutes(30));
  assert.deepEqual(result.changed, []);
  assert.equal((await getLeadTimeline(repos, c.id)).length, before);
  assert.equal(result.requirement.updatedAt.getTime(), minutes(10).getTime());
});

test("status: ACTIVE → ON_HOLD → ACTIVE → FULFILLED are recorded with from/to; a repeat or an unknown status is refused", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  await setRequirementStatus(repos, c.id, r.id, "ON_HOLD", FOUNDER, minutes(11));
  await setRequirementStatus(repos, c.id, r.id, "ACTIVE", FOUNDER, minutes(12));
  const done = await setRequirementStatus(repos, c.id, r.id, "FULFILLED", FOUNDER, minutes(13));
  assert.equal(done.status, "FULFILLED");
  const changes = (await events(repos, c.id, "REQUIREMENT_STATUS_CHANGED")).map((e) => `${e.payload.from}>${e.payload.to}`);
  assert.deepEqual(changes, ["ACTIVE>ON_HOLD", "ON_HOLD>ACTIVE", "ACTIVE>FULFILLED"]);
  await assert.rejects(setRequirementStatus(repos, c.id, r.id, "FULFILLED", FOUNDER), LeadStateError);
  await assert.rejects(setRequirementStatus(repos, c.id, r.id, "WON" as never, FOUNDER), LeadValidationError);
});

test("history: starting a new requirement CLOSES the active one (kept, not overwritten) and only one is ever ACTIVE", async () => {
  const { repos, c } = await world();
  const first = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  const second = await createRequirement(repos, c.id, { locations: ["Pune"], budgetMax: 5_000_000, budgetCurrency: "INR" }, FOUNDER, minutes(20));

  const all = await repos.requirements.listByLead(c.id);
  assert.deepEqual(all.map((r) => r.id), [second.id, first.id], "newest first");
  assert.equal(all.filter((r) => r.status === "ACTIVE").length, 1);
  assert.equal((await repos.requirements.getById(first.id))?.status, "CLOSED");
  assert.deepEqual((await repos.requirements.getById(first.id))?.locations, ["Thane", "Navi Mumbai"], "the old requirement is untouched");
  assert.equal(currentRequirement(all)?.id, second.id);

  const [created] = (await events(repos, c.id, "REQUIREMENT_CREATED")).slice(-1);
  assert.equal(created.payload.supersededRequirementId, first.id);
  assert.equal((await events(repos, c.id, "REQUIREMENT_STATUS_CHANGED")).at(-1)?.payload.reason, "SUPERSEDED");
  assert.equal((await repos.leads.getById(c.id))?.location, "Pune", "the lead summary follows the new active requirement");
});

test("history: a closed or fulfilled requirement cannot be edited, and cannot be re-activated while another is active", async () => {
  const { repos, c } = await world();
  const first = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  await createRequirement(repos, c.id, { locations: ["Pune"] }, FOUNDER, minutes(20));
  await assert.rejects(updateRequirementDetails(repos, c.id, first.id, FULL, FOUNDER), LeadStateError);
  await assert.rejects(setRequirementStatus(repos, c.id, first.id, "ACTIVE", FOUNDER), LeadStateError);
});

test("history: an ON_HOLD requirement can be edited and a new one can start beside it; the screen treats ON_HOLD as current only when nothing is active", async () => {
  const { repos, c } = await world();
  const first = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  await setRequirementStatus(repos, c.id, first.id, "ON_HOLD", FOUNDER, minutes(11));
  await updateRequirementDetails(repos, c.id, first.id, { ...FULL, configuration: "3 BHK" }, FOUNDER, minutes(12));
  assert.equal((await repos.requirements.getById(first.id))?.configuration, "3 BHK");
  const views = (await repos.requirements.listByLead(c.id)).map(toRequirementView);
  assert.equal(splitRequirements(views).current?.status, "ON_HOLD");
  const second = await createRequirement(repos, c.id, { locations: ["Pune"] }, FOUNDER, minutes(20));
  const split = splitRequirements((await repos.requirements.listByLead(c.id)).map(toRequirementView));
  assert.equal(split.current?.id, second.id);
  assert.equal(split.history.length, 1);
});

test("validation: budgets must be whole, non-negative, ordered, and carry a currency; nothing invalid is stored", async () => {
  const { repos, c } = await world();
  const bad: Array<[RequirementInput, string]> = [
    [{ budgetMin: -1, budgetCurrency: "INR" }, "negative minimum"],
    [{ budgetMax: -5, budgetCurrency: "INR" }, "negative maximum"],
    [{ budgetMin: 1.5, budgetCurrency: "INR" }, "fractional"],
    [{ budgetMin: Number.NaN, budgetCurrency: "INR" }, "NaN"],
    [{ budgetMin: 9_000_000, budgetMax: 8_000_000, budgetCurrency: "INR" }, "min above max"],
    [{ budgetMax: 8_000_000 }, "no currency"],
    [{ budgetMax: 8_000_000, budgetCurrency: "USD" as never }, "unknown currency"],
    [{ budgetMax: "12" as never, budgetCurrency: "INR" }, "string amount"],
  ];
  for (const [input, label] of bad) {
    await assert.rejects(createRequirement(repos, c.id, input, FOUNDER), LeadValidationError, label);
  }
  assert.deepEqual(await repos.requirements.listByLead(c.id), []);
  // A requirement with NO maximum, no minimum or no budget at all is perfectly valid.
  assert.ok(await createRequirement(repos, c.id, { budgetMin: 5_000_000, budgetCurrency: "AED" }, FOUNDER, minutes(10)));
});

test("validation: enums, text lengths and ids are checked", () => {
  assert.throws(() => validateRequirementInput({ purpose: "RENT" as never }), LeadValidationError);
  assert.throws(() => validateRequirementInput({ timeline: "SOON" as never }), LeadValidationError);
  assert.throws(() => validateRequirementInput({ configuration: "x".repeat(61) }), LeadValidationError);
  assert.throws(() => validateRequirementInput({ notes: "x".repeat(2001) }), LeadValidationError);
  assert.throws(() => validateRequirementInput(null as never), LeadValidationError);
  const ok = validateRequirementInput({ purpose: "INVESTMENT", timeline: "JUST_EXPLORING", configuration: "  5+ BHK  " });
  assert.equal(ok.configuration, "5+ BHK");
  assert.equal(ok.purpose, "INVESTMENT");
});

test("locations: trimmed, de-duplicated (Bengaluru = Bangalore), bounded, structured — never one delimited string", () => {
  assert.deepEqual(normalizeLocations(["  Thane ", "thane", "Navi   Mumbai", ""]).map((l) => l.name), ["Thane", "Navi Mumbai"]);
  assert.deepEqual(normalizeLocations(["Bengaluru", "Bangalore"]).map((l) => l.key), ["bangalore"], "one place, one key");
  assert.equal(locationKey("BENGALURU"), "bangalore");
  assert.equal(locationKey("Mira Road"), "mira road", "only Bengaluru is merged — Mira Road/Bhayandar and Vasai/Virar stay separate");
  assert.deepEqual(normalizeLocations(undefined), []);
  assert.throws(() => normalizeLocations("Thane" as never), LeadValidationError);
  assert.throws(() => normalizeLocations([42 as never]), LeadValidationError);
  assert.throws(() => normalizeLocations(["x".repeat(121)]), LeadValidationError);
  assert.throws(() => normalizeLocations(Array.from({ length: 11 }, (_, i) => `Place ${i}`)), LeadValidationError);
});

test("employee: creates, updates and changes status on THEIR lead — attributed to them, in the history", async () => {
  const { repos, priya, a, priyaActor } = await world();
  const r = await createRequirement(repos, a.id, FULL, priyaActor, minutes(20));
  assert.equal(r.createdBy, priya.userId);
  await updateRequirementDetails(repos, a.id, r.id, { ...FULL, budgetMax: 14_000_000 }, priyaActor, minutes(21));
  await setRequirementStatus(repos, a.id, r.id, "ON_HOLD", priyaActor, minutes(22));
  const mine = (await getLeadTimeline(repos, a.id)).filter((e) => e.actorType === "EMPLOYEE" && e.eventType.startsWith("REQUIREMENT_"));
  assert.deepEqual(mine.map((e) => e.eventType), ["REQUIREMENT_CREATED", "REQUIREMENT_UPDATED", "REQUIREMENT_STATUS_CHANGED"]);
  assert.ok(mine.every((e) => e.actorId === priya.userId));
  const lines = describeTimeline(await getLeadTimeline(repos, a.id), { [priya.userId]: "Priya Nair" }).map((l) => l.headline).join(" | ");
  assert.match(lines, /Requirement created/);
  assert.match(lines, /Requirement: active → on hold/);
});

test("employee: another employee's, an unassigned and an erased lead — create/update/status are all NotFound and write nothing", async () => {
  const { repos, a, b, c, priyaActor, rohanActor } = await world();
  const own = await createRequirement(repos, a.id, FULL, priyaActor, minutes(20));
  const before = (await getLeadTimeline(repos, a.id)).length;

  await assert.rejects(createRequirement(repos, a.id, FULL, rohanActor), LeadNotFoundError);
  await assert.rejects(updateRequirementDetails(repos, a.id, own.id, FULL, rohanActor), LeadNotFoundError);
  await assert.rejects(setRequirementStatus(repos, a.id, own.id, "CLOSED", rohanActor), LeadNotFoundError);
  await assert.rejects(createRequirement(repos, c.id, FULL, priyaActor), LeadNotFoundError, "an unassigned lead");
  await assert.rejects(createRequirement(repos, "99999999-9999-4999-8999-999999999999", FULL, priyaActor), LeadNotFoundError, "a missing lead");
  assert.equal((await getLeadTimeline(repos, a.id)).length, before);
  assert.deepEqual((await repos.requirements.listByLead(c.id)), []);

  await eraseLead(repos, b.id, FOUNDER, minutes(30));
  await assert.rejects(createRequirement(repos, b.id, FULL, rohanActor), LeadNotFoundError, "an erased lead leaves the employee's reach");
  await assert.rejects(createRequirement(repos, b.id, FULL, FOUNDER), LeadStateError, "even the founder cannot add to an erased lead");
});

test("IDOR: a requirement id from ANOTHER lead is unusable — for the founder and for the owner of the other lead alike", async () => {
  const { repos, a, b, c, priyaActor, rohanActor } = await world();
  const priyas = await createRequirement(repos, a.id, FULL, priyaActor);
  const rohans = await createRequirement(repos, b.id, { locations: ["Pune"] }, rohanActor);

  // Priya owns lead a, but is passing Rohan's requirement id.
  await assert.rejects(updateRequirementDetails(repos, a.id, rohans.id, FULL, priyaActor), LeadNotFoundError);
  await assert.rejects(setRequirementStatus(repos, a.id, rohans.id, "CLOSED", priyaActor), LeadNotFoundError);
  // The founder cannot cross leads either: the requirement must belong to the lead in the call.
  await assert.rejects(updateRequirementDetails(repos, c.id, priyas.id, FULL, FOUNDER), LeadNotFoundError);
  await assert.rejects(setRequirementStatus(repos, b.id, priyas.id, "CLOSED", FOUNDER), LeadNotFoundError);
  await assert.rejects(setRequirementStatus(repos, a.id, 42 as never, "CLOSED", FOUNDER), LeadNotFoundError);
  assert.equal((await repos.requirements.getById(rohans.id))?.status, "ACTIVE", "nothing changed");
  assert.equal((await repos.requirements.getById(priyas.id))?.status, "ACTIVE");
});

test("authorization: buyers, system and id-less actors are refused before any read; an employee cannot use founder-only operations", async () => {
  const { repos, a } = await world();
  for (const actor of [BUYER, SYSTEM, { actorType: "EMPLOYEE" } as LeadActor, { actorType: "FOUNDER" } as LeadActor]) {
    await assert.rejects(createRequirement(repos, a.id, FULL, actor), UnauthorizedLeadActionError);
    await assert.rejects(updateRequirementDetails(repos, a.id, "x", FULL, actor), UnauthorizedLeadActionError);
    await assert.rejects(setRequirementStatus(repos, a.id, "x", "CLOSED", actor), UnauthorizedLeadActionError);
  }
  assert.deepEqual(await repos.requirements.listByLead(a.id), []);
});

test("authorization: an inactive member and an unknown Clerk user never become actors, so they can never reach the requirement workflow", async () => {
  const { staff, priya } = await world();
  await setStaffActive(staff, priya.id, false, FOUNDER);
  assert.equal(await resolveEmployee(staff, priya.userId), null);
  assert.equal(await resolveEmployee(staff, "user_unknown_999"), null);
  assert.equal(await resolveEmployee(staff, null), null);
});

test("reads: the founder sees every lead's requirement history; an employee sees only their own lead's (the answer for any other is null)", async () => {
  const { repos, a, b, priyaActor, rohanActor } = await world();
  await createRequirement(repos, a.id, FULL, FOUNDER, minutes(10));
  await createRequirement(repos, a.id, { locations: ["Pune"] }, FOUNDER, minutes(11));
  await createRequirement(repos, b.id, { locations: ["Goa"] }, FOUNDER, minutes(12));

  assert.equal((await getLeadDetail(repos, a.id, minutes(20)))?.requirements.length, 2);
  assert.equal((await getMyLeadDetail(repos, priyaActor, a.id, minutes(20)))?.requirements.length, 2);
  assert.equal(await getMyLeadDetail(repos, priyaActor, b.id, minutes(20)), null);
  assert.equal(await listRequirementsForActor(repos, rohanActor, a.id), null);
  assert.equal((await listRequirementsForActor(repos, rohanActor, b.id))?.length, 1);
  assert.equal((await listRequirementsForActor(repos, FOUNDER, a.id))?.length, 2);
  assert.equal(await listRequirementsForActor(repos, BUYER, a.id), null);
  assert.equal(await listRequirementsForActor(repos, priyaActor, "99999999-9999-4999-8999-999999999999"), null);
});

test("erasure: notes and locations are cleared, the structured rows stay as history, and no event keeps free text", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, FULL, FOUNDER, minutes(10));
  await updateRequirementDetails(repos, c.id, r.id, { ...FULL, notes: "Call after 7pm" }, FOUNDER, minutes(11));
  await eraseLead(repos, c.id, FOUNDER, minutes(30));

  const kept = (await repos.requirements.getById(r.id))!;
  assert.equal(kept.notes, null);
  assert.deepEqual(kept.locations, []);
  assert.equal(kept.budgetMax, 12_000_000, "the structured band stays");
  assert.equal(kept.configuration, "2 BHK");
  const dump = JSON.stringify(await getLeadTimeline(repos, c.id));
  for (const secret of ["Thane", "Navi Mumbai", "Call after 7pm"]) assert.ok(!dump.includes(secret), `${secret} must be gone`);
});

test("redaction: the new event types keep only ids, enums and field NAMES; free-text fields are dropped", () => {
  assert.deepEqual(redactPayload("REQUIREMENT_STATUS_CHANGED", { requirementId: "r1", from: "ACTIVE", to: "CLOSED", note: "typed text" }), {
    requirementId: "r1",
    from: "ACTIVE",
    to: "CLOSED",
    redacted: true,
  });
  assert.deepEqual(
    redactPayload("REQUIREMENT_UPDATED", { requirementId: "r1", fields: { budgetMax: { from: 1, to: 2 }, notes: { changed: true }, locations: { changed: true }, location: { from: "a", to: "b" } } }),
    { requirementId: "r1", fields: { budgetMax: { from: 1, to: 2 } }, redacted: true },
  );
});

test("matching foundation: a requirement projects to normalised, free-text-free criteria — and there is no score anywhere", async () => {
  const { repos, c } = await world();
  const r = await createRequirement(repos, c.id, { ...FULL, locations: ["Bengaluru", "Thane"] }, FOUNDER);
  const m = toMatchableRequirement(r);
  assert.deepEqual(m.locationKeys, ["bangalore", "thane"]);
  assert.deepEqual(m.budget, { min: 8_000_000, max: 12_000_000, currency: "INR" });
  assert.equal(m.configuration, "2 BHK");
  assert.ok(!("notes" in m) && !("score" in m));
  assert.equal(toMatchableRequirement(await createRequirement(repos, c.id, { locations: [] }, FOUNDER, minutes(5))).budget, null);
});

test("prefill: a lead that already carries details offers them as the starting point for a structured requirement", async () => {
  const { repos, c } = await world();
  await repos.leads.update(c.id, { location: "Thane", budgetMax: 9_000_000, budgetCurrency: "INR", configuration: "2 BHK" }, minutes(2));
  const prefill = prefillFromLead((await repos.leads.getById(c.id))!);
  assert.deepEqual(prefill.locations, ["Thane"]);
  assert.equal(prefill.budgetMax, 9_000_000);
  assert.equal(prefill.configuration, "2 BHK");
});
