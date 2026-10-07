import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelQuality, forecast, modelReadiness, nextStep, rateEstimate, SUFFICIENCY, wilsonInterval, type LeadActionContext } from "../intelligence.ts";
import { auc, MIN_EXAMPLES, MIN_USEFUL_AUC, predict, trainLogistic, type Example } from "../logistic.ts";
import { getIntelligence, getNextStepForLead } from "../intelligence-service.ts";
import type { AcquisitionRow, TouchEvidence } from "../acquisition.ts";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * Phase 9. This file proves two things: the decision support is explainable and deterministic, and the machine-learning
 * capability REFUSES to run without enough data. The synthetic datasets used below exist only inside these tests to
 * exercise the trainer's mechanics; they are never loaded by the product, and no screen shows a prediction.
 */

const ctx = (over: Partial<LeadActionContext> = {}): LeadActionContext => ({ status: "CONTACTED", ownerAssigned: true, contactAttempts: 2, lastActivityDaysAgo: 0, followUp: { state: "UPCOMING" }, visitAwaitingOutcome: false, openVisit: false, lastCall: null, hasRequirement: false, matchingProjects: 0, shortlisted: 0, ...over });

// --- statistics ---------------------------------------------------------------------------------------

test("wilson interval: matches known values, stays inside 0..1, and is wide for small samples and narrow for large ones", () => {
  const small = wilsonInterval(5, 10)!;
  assert.ok(Math.abs(small.low - 0.2366) < 0.002 && Math.abs(small.high - 0.7634) < 0.002, `5/10 -> ${small.low.toFixed(4)}..${small.high.toFixed(4)}`);
  const big = wilsonInterval(500, 1000)!;
  assert.ok(big.high - big.low < 0.07 && small.high - small.low > 0.45);
  const zero = wilsonInterval(0, 40)!;
  assert.equal(zero.low, 0);
  assert.ok(zero.high > 0 && zero.high < 0.12, "zero successes still carries uncertainty");
  assert.equal(wilsonInterval(3, 0), null);
  assert.equal(wilsonInterval(5, 4), null);
});

test("rate estimate: below the minimum sample there is NO rate at all - not a small number, no number", () => {
  const few = rateEstimate(3, SUFFICIENCY.MIN_LEADS_FOR_RATE - 1);
  assert.deepEqual([few.status, few.rate, few.low, few.high], ["INSUFFICIENT_DATA", null, null, null]);
  const enough = rateEstimate(6, SUFFICIENCY.MIN_LEADS_FOR_RATE);
  assert.equal(enough.status, "ESTIMATE");
  assert.ok(enough.low! < enough.rate! && enough.rate! < enough.high!);
});

const touch = (over: Partial<TouchEvidence> = {}): TouchEvidence => ({ utmSource: null, utmMedium: null, utmCampaign: null, gclid: null, fbclid: null, referrer: null, landingPath: "/", ...over });
const row = (i: number, over: Partial<AcquisitionRow> = {}): AcquisitionRow => ({ leadId: `l${i}`, createdAt: T0, sourceType: "DIGITAL", creationMethod: "WEBSITE_GATE", first: touch({ gclid: "g" }), latest: null, reachedQualified: false, hasSiteVisit: false, booked: false, bookings: [], ...over });

test("channel quality: a small channel gets no rate, a large one gets a rate with its interval", () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => row(i, { reachedQualified: i < 10 })),
    ...Array.from({ length: 5 }, (_, i) => row(100 + i, { first: touch({ fbclid: "f" }), reachedQualified: true })),
  ];
  const q = channelQuality(rows);
  const google = q.find((c) => c.channel === "GOOGLE_ADS")!;
  const meta = q.find((c) => c.channel === "META")!;
  assert.equal(google.qualified.status, "ESTIMATE");
  assert.equal(google.qualified.rate, 0.25);
  assert.equal(meta.qualified.status, "INSUFFICIENT_DATA", "5 leads, all qualified, is still not enough to call it 100%");
  assert.equal(meta.qualified.rate, null);
});

// --- forecast -----------------------------------------------------------------------------------------

test("forecast: with little history it refuses and says why; with enough it is an expectation built from past stage-to-booking rates", () => {
  const sparse = forecast({ open: [{ stage: "QUALIFIED", count: 10 }], history: [{ stage: "QUALIFIED", reached: 12, booked: 3 }], totalBookings: 3, averageCommission: {} });
  assert.equal(sparse.status, "INSUFFICIENT_DATA");
  assert.equal(sparse.expectedBookings, null);
  assert.ok(sparse.reasons.length >= 2 && sparse.reasons.some((r) => /at least 10 are needed/.test(r)) && sparse.reasons.some((r) => /Not enough history for qualified/.test(r)));

  const ok = forecast({
    open: [{ stage: "QUALIFIED", count: 20 }, { stage: "SITE_VISIT_DONE", count: 4 }],
    history: [{ stage: "QUALIFIED", reached: 100, booked: 10 }, { stage: "SITE_VISIT_DONE", reached: 40, booked: 20 }],
    totalBookings: 30,
    averageCommission: { INR: { average: 150_000, bookings: 25 }, AED: { average: 9_000, bookings: 3 } },
  });
  assert.equal(ok.status, "ESTIMATE");
  assert.equal(ok.expectedBookings, 20 * 0.1 + 4 * 0.5);
  assert.equal(ok.expectedCommission.INR, Math.round(4 * 150_000));
  assert.equal(ok.expectedCommission.AED, undefined, "3 bookings is too few to trust an average commission");
  assert.ok(ok.stages.every((s) => s.rate.n > 0));
});

test("forecast: no open pipeline is stated as such rather than a confident zero", () => {
  const none = forecast({ open: [{ stage: "QUALIFIED", count: 0 }], history: [{ stage: "QUALIFIED", reached: 100, booked: 10 }], totalBookings: 40, averageCommission: {} });
  assert.equal(none.status, "INSUFFICIENT_DATA");
  assert.match(none.reasons[0], /no open leads/);
});

// --- readiness and the gated trainer ----------------------------------------------------------------

test("readiness: the gate states exactly what is missing and opens only when both thresholds are met", () => {
  const closed = modelReadiness(120, 8);
  assert.equal(closed.ready, false);
  assert.deepEqual(closed.needs, [`${SUFFICIENCY.MODEL_MIN_LABELLED_LEADS - 120} more leads with a settled outcome`, `${SUFFICIENCY.MODEL_MIN_POSITIVES - 8} more bookings`]);
  assert.equal(modelReadiness(500, 49).ready, false);
  assert.equal(modelReadiness(500, 50).ready, true);
});

function synthetic(n: number, signal: number): Example[] {
  // Deterministic pseudo-random sequence (no Math.random): the dataset is reproducible and test-only.
  let seed = 12345;
  const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, () => {
    const x = next() * 2 - 1;
    const noise = next() * 2 - 1;
    const p = 1 / (1 + Math.exp(-(signal * x + 0.3 * noise)));
    return { features: [x], label: next() < p ? 1 : 0 } as Example;
  });
}

test("trainer REFUSES to train on too little data and says what is missing - no weights, no prediction", () => {
  const result = trainLogistic(synthetic(MIN_EXAMPLES - 1, 3));
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.ok(result.status === "INSUFFICIENT_DATA" && result.needs.length > 0);
  const lopsided = trainLogistic(Array.from({ length: 600 }, (_, i) => ({ features: [i % 7], label: (i < 10 ? 1 : 0) as 0 | 1 })));
  assert.equal(lopsided.status, "INSUFFICIENT_DATA", "enough rows but too few positives is still not enough");
});

test("trainer, once data suffices: learns a real signal and is judged on data it never saw; pure noise is NOT declared useful", () => {
  const real = trainLogistic(synthetic(1500, 3));
  assert.equal(real.status, "TRAINED");
  if (real.status === "TRAINED") {
    assert.ok(real.heldOut.auc >= MIN_USEFUL_AUC && real.useful, `a genuine signal clears the bar (AUC ${real.heldOut.auc.toFixed(2)})`);
    assert.ok(real.weights[0] > 0.5);
    assert.ok(predict(real, [0.9]) > predict(real, [-0.9]));
  }
  const noise = trainLogistic(synthetic(1500, 0));
  assert.equal(noise.status, "TRAINED");
  if (noise.status === "TRAINED") {
    assert.equal(noise.useful, false, "no signal, no usefulness - the verdict says so");
    assert.match(noise.verdict, /not shown to anyone/);
  }
  // Deterministic: same data, same model.
  const again = trainLogistic(synthetic(1500, 3));
  assert.deepEqual(again.status === "TRAINED" && real.status === "TRAINED" ? again.weights : null, real.status === "TRAINED" ? real.weights : undefined);
});

test("auc: perfect, inverted, tied and one-class cases", () => {
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0]), 1);
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [1, 1, 0, 0]), 0);
  assert.equal(auc([0.5, 0.5], [1, 0]), 0.5);
  assert.equal(auc([0.5, 0.6], [1, 1]), null);
});

// --- next step (rules, not AI) ------------------------------------------------------------------------

test("next step: priority order, each rule gives the action AND the facts, and closed-out leads are left alone", () => {
  const cases: Array<[Partial<LeadActionContext>, string]> = [
    [{ status: "BOOKED" }, "CLOSED_OUT"],
    [{ followUp: { state: "OVERDUE" }, visitAwaitingOutcome: true }, "FOLLOW_UP_OVERDUE"],
    [{ visitAwaitingOutcome: true, followUp: { state: "DUE_SOON" } }, "VISIT_AWAITING_OUTCOME"],
    [{ followUp: { state: "DUE_SOON" } }, "FOLLOW_UP_DUE"],
    [{ lastCall: { classification: "CONNECTED", disposition: "CALLBACK_REQUESTED" }, followUp: { state: "NONE" } }, "PROMISED_FOLLOW_UP"],
    [{ status: "NEW", contactAttempts: 0, followUp: { state: "NONE" } }, "FIRST_CONTACT"],
    [{ hasRequirement: true, matchingProjects: 2, shortlisted: 0, followUp: { state: "UPCOMING" } }, "SHORTLIST_MATCHES"],
    [{ status: "QUALIFIED", shortlisted: 1, openVisit: false, followUp: { state: "UPCOMING" } }, "OFFER_SITE_VISIT"],
    [{ lastActivityDaysAgo: 5, followUp: { state: "NONE" } }, "RECONNECT"],
    [{}, "NO_ACTION"],
  ];
  for (const [over, rule] of cases) {
    const step = nextStep(ctx(over));
    assert.equal(step.rule, rule, JSON.stringify(over));
    assert.ok(step.action && step.reasons.length > 0, `${rule} explains itself`);
  }
  // The example from the brief: explainable, with the facts.
  const promised = nextStep(ctx({ lastCall: { classification: "CONNECTED", disposition: "CALLBACK_REQUESTED" }, followUp: { state: "NONE" } }));
  assert.match(promised.reasons.join(" "), /callback requested/);
  assert.deepEqual(nextStep(ctx({ followUp: { state: "OVERDUE" } })), nextStep(ctx({ followUp: { state: "OVERDUE" } })), "deterministic");
});

// --- the service: authorization and what it carries ---------------------------------------------------

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const lead = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 49191", name: "Secret Buyer" }), T0)).lead;
  await assignLead(repos, staff, lead.id, priya.id, FOUNDER, minutes(5));
  return { repos, staff, lead, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor, rohanActor: (await resolveEmployee(staff, rohan.userId))!.actor };
}

test("service: an employee gets a next step only for their own lead; others and unknown ids are 'not found'; the step carries no buyer data", async () => {
  const w = await world();
  const mine = await getNextStepForLead(w.repos, w.priyaActor, w.lead.id, minutes(10));
  assert.equal(mine.step.rule, "FIRST_CONTACT");
  assert.doesNotMatch(JSON.stringify(mine), /Secret Buyer|98765/);
  await assert.rejects(getNextStepForLead(w.repos, w.rohanActor, w.lead.id, minutes(10)), LeadNotFoundError);
  await assert.rejects(getNextStepForLead(w.repos, w.priyaActor, "00000000-0000-4000-8000-000000000000", minutes(10)), LeadNotFoundError);
  await assert.rejects(getNextStepForLead(w.repos, { actorType: "BUYER", actorId: "x" }, w.lead.id), UnauthorizedLeadActionError);
  await scheduleFollowUp(w.repos, w.lead.id, { scheduledAt: new Date(minutes(10).getTime() + 3_600_000) }, w.priyaActor, minutes(10));
  assert.equal((await getNextStepForLead(w.repos, w.priyaActor, w.lead.id, new Date(minutes(10).getTime() + 2 * 3_600_000))).step.rule, "FOLLOW_UP_OVERDUE");
});

test("intelligence report: Founder only; with this little data there is no forecast and no model, and it says so", async () => {
  const w = await world();
  await assert.rejects(getIntelligence(w.repos, w.priyaActor, minutes(20)), UnauthorizedLeadActionError);
  const intel = await getIntelligence(w.repos, FOUNDER, new Date(T0.getTime() + 2 * 86_400_000));
  assert.equal(intel.forecast.status, "INSUFFICIENT_DATA");
  assert.equal(intel.readiness.ready, false);
  assert.match(intel.modelStatus, /No model is trained and no prediction is shown/);
  assert.equal(intel.channels.every((c) => c.qualified.status === "INSUFFICIENT_DATA"), true);
  assert.ok(intel.steps.length >= 1);
});

// --- static guarantees ---------------------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: nothing in the product loads the trainer or any model output; the pages are Founder-gated; the rules call themselves rules, not AI", () => {
  const importers = ["src/lib/leads/intelligence-service.ts", "src/app/admin/intelligence/page.tsx", "src/components/leads/next-step-card.tsx", "src/app/team/_components/lead-projects-visits.tsx", "src/app/admin/leads/_components/lead-projects-visits.tsx"].map(read).join("\n");
  assert.doesNotMatch(importers, /logistic/, "no screen or service imports the trainer");
  const page = read("src/app/admin/intelligence/page.tsx");
  assert.match(page, /await requireFounder\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(read("src/components/leads/next-step-card.tsx"), /not by AI/);
  const code = (read("src/lib/leads/intelligence.ts") + read("src/lib/leads/logistic.ts")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /Math\.random|fetch\(|openai|anthropic|llm|embedding/i, "no randomness, no network, no hosted model");
});
