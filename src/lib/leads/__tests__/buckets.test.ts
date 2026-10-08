import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { createSelfGeneratedLead } from "../lead-import-service.ts";
import { createProject } from "../project-service.ts";
import { saveColdCallLead } from "../cold-call-lead-service.ts";
import { prepareDeviceCall, reportDeviceCall } from "../call-service.ts";
import { getLeadCounts, getLeadsPage, getMyLeadsPage } from "../lead-reads.ts";
import { parseSourceFilter, sourceTypeOf } from "../../../components/admin/leads/lead-source-tabs.tsx";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const DEV = "11111111-1111-4111-8111-111111111111";
const NOW = minutes(120);

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const priyaActor = (await resolveEmployee(staff, priya.userId))!.actor;
  const developerNames = repos.leads.developerNames;
  repos.leads.developerNames = async (ids: string[]) => ({ ...(await developerNames(ids)), ...Object.fromEntries(ids.filter((i) => i === DEV).map((i) => [i, "Acme Realty"])) });
  const project = await createProject(repos, { developerId: DEV, name: "Acme Heights", city: "Thane" }, FOUNDER, minutes(2));
  // 3 digital leads (the website gate), 2 cold-call leads (one saved through the intake, one made by hand).
  const digital = [];
  for (let n = 1; n <= 3; n++) digital.push((await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${4300 + n}`, name: `Web ${n}` }), T0)).lead);
  await assignLead(repos, staff, digital[0].id, priya.id, FOUNDER, minutes(5));
  const intake = await saveColdCallLead(repos, { phone: "+91 98111 33001", name: "Cold One", interest: "INTERESTED", qualification: { outcome: "QUALIFIED" }, projectIds: [project.id] }, priyaActor, minutes(30));
  assert.ok(intake.saved);
  const made = await createSelfGeneratedLead(repos, { phone: "+91 98111 33002", name: "Cold Two", creationMethod: "COLD_CALLING" }, FOUNDER, minutes(31));
  assert.ok(made.created);
  return { repos, priyaActor, digital, cold: [intake.leadId, made.lead.id], project };
}

test("buckets: Cold Call and Digital are an exact partition of the one lead table - nothing in both, nothing in neither", async () => {
  const w = await world();
  const all = await getLeadsPage(w.repos, "all", 1, NOW);
  const cold = await getLeadsPage(w.repos, "all", 1, NOW, undefined, "COLD_CALL");
  const digital = await getLeadsPage(w.repos, "all", 1, NOW, undefined, "DIGITAL");
  assert.equal(all.total, 5);
  assert.equal(cold.total, 2);
  assert.equal(digital.total, 3);
  const ids = (page: typeof all) => page.items.map((i) => i.lead.id);
  assert.deepEqual([...ids(cold), ...ids(digital)].sort(), ids(all).sort());
  assert.ok(cold.items.every((i) => i.lead.sourceType === "COLD_CALL"));
  assert.ok(digital.items.every((i) => i.lead.sourceType === "DIGITAL"));
  const counts = { all: await getLeadCounts(w.repos, NOW), cold: await getLeadCounts(w.repos, NOW, "COLD_CALL"), digital: await getLeadCounts(w.repos, NOW, "DIGITAL") };
  assert.equal(counts.cold.total + counts.digital.total, counts.all.total);
  assert.equal(counts.cold.qualified + counts.digital.qualified, counts.all.qualified);
  assert.equal(counts.cold.qualified, 1, "the intake lead is qualified");
});

test("buckets: a team member's bucket holds only their own leads of that source", async () => {
  const w = await world();
  const mineCold = await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, NOW, undefined, "COLD_CALL");
  const mineDigital = await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, NOW, undefined, "DIGITAL");
  const mineAll = await getMyLeadsPage(w.repos, w.priyaActor, "all", 1, NOW);
  assert.deepEqual(mineCold.items.map((i) => i.lead.name), ["Cold One"], "Cold Two is the Founder's, not hers");
  assert.deepEqual(mineDigital.items.map((i) => i.lead.name), ["Web 1"]);
  assert.equal(mineAll.total, 2);
});

test("a source can never be filtered by something the browser invents: only the three known filters parse", () => {
  assert.equal(parseSourceFilter("cold_call"), "cold_call");
  assert.equal(parseSourceFilter("digital"), "digital");
  assert.equal(parseSourceFilter(["digital", "cold_call"]), "digital");
  for (const bad of [undefined, "", "COLD_CALL", "self_generated", "cold", "all; drop table leads", "SELF_GENERATED"]) assert.equal(parseSourceFilter(bad as never), "all", String(bad));
  assert.equal(sourceTypeOf("cold_call"), "COLD_CALL");
  assert.equal(sourceTypeOf("digital"), "DIGITAL");
  assert.equal(sourceTypeOf("all"), undefined);
});

test("card insights: interested projects and the last call, in one batched read; a lead with neither shows nothing", async () => {
  const w = await world();
  const [coldId] = w.cold;
  const prepared = await prepareDeviceCall(w.repos, coldId, w.priyaActor, {}, minutes(60));
  await reportDeviceCall(w.repos, prepared.call.id, { startedAt: minutes(60), durationSeconds: 23, simRef: "1", callLogRef: "7", deviceRef: "Pixel" }, w.priyaActor, minutes(61));
  const insights = await w.repos.leads.bucketInsights([coldId, w.cold[1], w.digital[1].id]);
  const one = insights.find((i) => i.leadId === coldId)!;
  assert.deepEqual(one.interestedProjects, ["Acme Heights"]);
  assert.equal(one.interestedProjectCount, 1);
  assert.equal(one.lastCallClassification, "CONNECTED");
  assert.equal(one.lastCallDurationSeconds, 23);
  const none = insights.find((i) => i.leadId === w.digital[1].id)!;
  assert.deepEqual([none.lastCallAt, none.interestedProjectCount], [null, 0]);
  assert.deepEqual(await w.repos.leads.bucketInsights([]), []);
  const page = await getLeadsPage(w.repos, "all", 1, NOW, undefined, "COLD_CALL");
  assert.equal(page.items.find((i) => i.lead.id === coldId)!.insight!.interestedProjects[0], "Acme Heights");
});

test("static: three views of one table - the source tabs link to the same page, the card shows the source, and 'Cold' temperature is not renamed to a source", () => {
  const tabs = read("src/components/admin/leads/lead-source-tabs.tsx");
  assert.match(tabs, /all: "All leads", cold_call: "Cold call", digital: "Digital"/);
  assert.match(tabs, /ONE lead table/);
  const founder = read("src/app/admin/leads/page.tsx");
  assert.match(founder, /getLeadsPage\(repos, view, page, now, undefined, sourceType\)/);
  assert.match(founder, /getLeadCounts\(repos, now, sourceType\)/);
  const team = read("src/app/team/page.tsx");
  assert.match(team, /getMyLeadsPage\(repos, actor, view, page, now, undefined, sourceTypeOf\(source\)\)/);
  const card = read("src/components/admin/leads/lead-card.tsx");
  assert.match(card, /leadSourceLabel\(lead\)/);
  assert.match(card, /WhatsAppOpenLink/);
  const viewTabs = read("src/components/admin/leads/leads-view-tabs.tsx");
  assert.match(viewTabs, /cold: "Cold"/, "the temperature chip keeps its meaning");
});

test("static: WhatsApp everywhere goes through the one component that records OPENED - never 'sent' - and the server authorizes", () => {
  for (const file of ["src/components/admin/leads/lead-card.tsx", "src/components/admin/leads/lead-actions-panel.tsx", "src/components/team/team-lead-actions.tsx"]) {
    const src = read(file);
    assert.match(src, /<WhatsAppOpenLink/, `${file} uses the recording link`);
    assert.doesNotMatch(src, /<a\s[^>]*href=\{(props\.whatsappHref|wa)\}/, `${file} has no bare WhatsApp anchor left`);
  }
  const link = read("src/components/leads/whatsapp-open-link.tsx");
  assert.match(link, /OPENED/);
  assert.match(link, /never that a message was sent/i);
  assert.doesNotMatch(link.replace(/\/\*[\s\S]*?\*\//g, ""), /MESSAGE_SENT|messageSent/i);
});
