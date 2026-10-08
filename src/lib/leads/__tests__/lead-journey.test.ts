import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLead, captureAssistanceLead, createBooking, changeLeadStatus } from "../lead-service.ts";
import { createProject, shortlistProject } from "../project-service.ts";
import { createRequirement } from "../requirement-service.ts";
import { buildJourney, getLeadJourney } from "../lead-journey.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const DEV = "11111111-1111-4111-8111-111111111111";
const state = (steps: ReturnType<typeof buildJourney>) => steps.map((s) => `${s.stage}:${s.state[0]}`).join(" ");

test("journey: a brand-new lead is done at Lead, and Requirement is the one next step", () => {
  const steps = buildJourney({ lead: { createdAt: T0, status: "NEW" }, events: [], requirementAts: [], shortlistAts: [], visitAts: [], bookingAts: [], commissionReceivedAts: [] });
  assert.equal(state(steps), "LEAD:D REQUIREMENT:C MATCHING:A SHORTLIST:A SITE_VISIT:A NEGOTIATION:A BOOKING:A REVENUE:A");
});

test("journey: stages come only from records, in order, with the first date each was reached", async () => {
  const repos = createInMemoryLeadRepositories();
  const names = repos.leads.developerNames;
  repos.leads.developerNames = async (ids: string[]) => ({ ...(await names(ids)), ...Object.fromEntries(ids.filter((i) => i === DEV).map((i) => [i, "Acme Realty"])) });
  const lead = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 48001" }), T0)).lead;
  await createRequirement(repos, lead.id, { configuration: "2 BHK" }, FOUNDER, minutes(5));
  const project = await createProject(repos, { developerId: DEV, name: "Acme Heights", city: "Thane" }, FOUNDER, minutes(6));
  await shortlistProject(repos, lead.id, project.id, FOUNDER, minutes(7), { advanceStatus: false });
  let steps = await getLeadJourney(repos, (await repos.leads.getById(lead.id))!);
  assert.equal(state(steps), "LEAD:D REQUIREMENT:D MATCHING:D SHORTLIST:C SITE_VISIT:A NEGOTIATION:A BOOKING:A REVENUE:A", "projects picked, but the pipeline has not moved: Matching is done, Shortlist is next");
  assert.equal(steps[2].at!.getTime(), minutes(7).getTime());

  await changeLeadStatus(repos, lead.id, "NEGOTIATION", FOUNDER, {}, minutes(10));
  await createBooking(repos, lead.id, { currency: "INR", bookingValue: 9_000_000, commissionExpected: 100_000 }, FOUNDER, minutes(12));
  steps = await getLeadJourney(repos, (await repos.leads.getById(lead.id))!);
  assert.equal(steps.find((s) => s.stage === "NEGOTIATION")!.state, "DONE");
  assert.equal(steps.find((s) => s.stage === "BOOKING")!.state, "DONE");
  assert.equal(steps.find((s) => s.stage === "REVENUE")!.state, "CURRENT", "booked, but no commission has been received");
  assert.equal(steps.filter((s) => s.state === "CURRENT").length, 1, "exactly one next step");
  void assignLead;
});

test("journey: a stage nobody recorded is shown as not recorded, never invented", () => {
  const steps = buildJourney({ lead: { createdAt: T0, status: "BOOKED" }, events: [], requirementAts: [], shortlistAts: [], visitAts: [], bookingAts: [minutes(3)], commissionReceivedAts: [] });
  assert.equal(state(steps), "LEAD:D REQUIREMENT:S MATCHING:S SHORTLIST:D SITE_VISIT:S NEGOTIATION:D BOOKING:D REVENUE:C");
});
