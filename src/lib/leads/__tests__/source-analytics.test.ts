import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLead, captureAssistanceLead, createBooking } from "../lead-service.ts";
import { createSelfGeneratedLead } from "../lead-import-service.ts";
import { prepareDeviceCall, reportDeviceCall } from "../call-service.ts";
import { recordQualification } from "../qualification-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { UnauthorizedLeadActionError } from "../errors.ts";
import { getPersonFunnel, getSourceFunnel, rate } from "../source-analytics.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const RANGE = { from: new Date(T0.getTime() - 86_400_000), to: new Date(T0.getTime() + 86_400_000) };

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const priyaActor = (await resolveEmployee(staff, priya.userId))!.actor;
  const cold = [];
  for (let n = 0; n < 12; n++) {
    const made = await createSelfGeneratedLead(repos, { phone: `+91 98111 3${3100 + n}`, name: `Cold ${n}`, creationMethod: "COLD_CALLING" }, priyaActor, T0);
    assert.ok(made.created);
    cold.push(made.lead);
  }
  const digital = [];
  for (let n = 1; n <= 3; n++) digital.push((await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${5200 + n}`, name: `Web ${n}` }), T0)).lead);
  await assignLead(repos, staff, digital[0].id, priya.id, FOUNDER, minutes(5));

  // Cold lead 0: connected call, qualified, booked in INR. Cold lead 1: a call that only rang.
  const connected = await prepareDeviceCall(repos, cold[0].id, priyaActor, {}, minutes(10));
  await reportDeviceCall(repos, connected.call.id, { startedAt: minutes(10), durationSeconds: 40, simRef: "1", callLogRef: "1", deviceRef: "Pixel" }, priyaActor, minutes(11));
  const rang = await prepareDeviceCall(repos, cold[1].id, priyaActor, {}, minutes(12));
  await reportDeviceCall(repos, rang.call.id, { startedAt: minutes(12), durationSeconds: 4, simRef: "1", callLogRef: "2", deviceRef: "Pixel" }, priyaActor, minutes(13));
  await recordQualification(repos, cold[0].id, { outcome: "QUALIFIED" }, priyaActor, minutes(14));
  await createBooking(repos, cold[0].id, { currency: "INR", bookingValue: 12_000_000, commissionExpected: 300_000 }, FOUNDER, minutes(20));
  // A digital booking in a different currency: never added to the INR one.
  await createBooking(repos, digital[1].id, { currency: "AED", bookingValue: 2_000_000, commissionExpected: 40_000 }, FOUNDER, minutes(21));
  return { repos, priyaActor, cold, digital };
}

test("rate: a percentage is withheld until the sample is big enough to mean something", () => {
  assert.equal(rate(1, 2), null);
  assert.equal(rate(1, 9), null);
  assert.equal(rate(1, 10), 10);
  assert.equal(rate(1, 12), 8.3);
});

test("source funnel: each stage counts distinct leads that ever reached it, per source, with currencies kept apart", async () => {
  const w = await world();
  const [cold, digital] = await getSourceFunnel(w.repos, FOUNDER, RANGE);
  assert.equal(cold.sourceType, "COLD_CALL");
  assert.equal(digital.sourceType, "DIGITAL");
  assert.equal(cold.counts.leads, 12);
  assert.equal(cold.counts.called, 2);
  assert.equal(cold.counts.connected, 1, "the 4-second call only rang");
  assert.equal(cold.counts.qualified, 1);
  assert.equal(cold.counts.booked, 1);
  assert.equal(cold.talkSeconds, 40);
  assert.equal(cold.rates.connected, 8.3);
  assert.equal(digital.counts.leads, 3);
  assert.equal(digital.counts.booked, 1);
  assert.equal(digital.rates.booked, null, "three leads is too few for a percentage");
  assert.deepEqual(cold.revenue.map((r) => [r.currency, r.bookingValue]), [["INR", 12_000_000]]);
  assert.deepEqual(digital.revenue.map((r) => [r.currency, r.bookingValue]), [["AED", 2_000_000]]);
  for (const s of [cold, digital]) {
    const c = s.counts;
    assert.ok(c.leads >= c.called && c.called >= c.connected, "stages only ever shrink");
    assert.ok(c.leads >= c.qualified && c.qualified >= c.booked);
  }
});

test("source funnel: leads created outside the range, and a single-source filter, are respected", async () => {
  const w = await world();
  const empty = await getSourceFunnel(w.repos, FOUNDER, { from: minutes(500), to: minutes(600) });
  assert.ok(empty.every((s) => s.counts.leads === 0 && s.revenue.length === 0));
  const only = await getSourceFunnel(w.repos, FOUNDER, RANGE, "DIGITAL");
  assert.deepEqual(only.map((s) => s.sourceType), ["DIGITAL"]);
});

test("person funnel: cold-call leads credit their creator, digital leads their owner, and the two stay separate rows", async () => {
  const w = await world();
  const people = await getPersonFunnel(w.repos, FOUNDER, RANGE);
  const cold = people.find((p) => p.sourceType === "COLD_CALL")!;
  const digital = people.find((p) => p.sourceType === "DIGITAL")!;
  assert.equal(cold.personId, w.priyaActor.actorId);
  assert.equal(cold.counts.leads, 12);
  assert.equal(digital.personId, w.priyaActor.actorId, "the one assigned digital lead");
  assert.equal(digital.counts.leads, 1);
  assert.equal(people.length, 2);
});

test("source analytics: only the Founder can read it", async () => {
  const w = await world();
  await assert.rejects(getSourceFunnel(w.repos, w.priyaActor, RANGE), UnauthorizedLeadActionError);
  await assert.rejects(getPersonFunnel(w.repos, w.priyaActor, RANGE), UnauthorizedLeadActionError);
});
