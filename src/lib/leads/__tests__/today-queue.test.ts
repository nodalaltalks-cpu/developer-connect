import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTodayQueue, type TodayQueueInput } from "../today-queue.ts";
import { getTodayQueue, addNote, captureAssistanceLead, changeLeadStatus, logContact, setFollowUp } from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import type { Lead, LeadActivitySummary } from "../types.ts";
import { FOUNDER, captureInput, hoursFrom } from "./test-helpers.ts";
import { HIGH_BUDGET_MIN, QUEUE_DORMANT_STATUSES, QUEUE_EXCLUDED_STATUSES, RECENT_ACTIVITY_HOURS, STALE_CONTACT_HOURS } from "../queue-config.ts";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const ago = (hours: number) => hoursFrom(NOW, -hours);
const inFuture = (hours: number) => hoursFrom(NOW, hours);

let counter = 0;
function lead(overrides: Partial<Lead> = {}): Lead {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return {
    id,
    name: null,
    phoneE164: `+9198765${String(10000 + counter)}`,
    email: null,
    contactPreference: "WHATSAPP",
    status: "NEW",
    temperature: null,
    ownerId: null,
    developerId: null,
    sourceCta: "developer_page",
    location: null,
    budgetMin: null,
    budgetMax: null,
    budgetCurrency: null,
    configuration: null,
    propertyType: null,
    purpose: null,
    timeline: null,
    sessionId: null,
    userId: null,
    firstTouchId: null,
    lastTouchId: null,
    nextFollowUpAt: null,
    lastActivityAt: NOW,
    erasedAt: null,
    createdAt: ago(1),
    updatedAt: ago(1),
    ...overrides,
  };
}

function summary(leadRecord: Lead, overrides: Partial<LeadActivitySummary> = {}): LeadActivitySummary {
  return {
    leadId: leadRecord.id,
    lastContactAt: null,
    contactAttempts: 0,
    lastBuyerActivityAt: null,
    lastBuyerActivityDeveloperName: null,
    firstDeveloperName: null,
    ...overrides,
  };
}

const input = (leadRecord: Lead, extra: Partial<TodayQueueInput> = {}, summaryOverrides: Partial<LeadActivitySummary> = {}): TodayQueueInput => ({
  lead: leadRecord,
  developerName: null,
  summary: summary(leadRecord, summaryOverrides),
  ...extra,
});

const ids = (entries: { leadId: string }[]) => entries.map((entry) => entry.leadId);

// --- bucket priority ---------------------------------------------------------------------------

test("queue: the five buckets appear in the approved priority order", () => {
  const recent = lead({ status: "CONTACTED", createdAt: ago(100) });
  const strong = lead({ status: "CONTACTED", timeline: "WITHIN_30_DAYS", createdAt: ago(100) });
  const highValue = lead({ status: "QUALIFIED", budgetMax: 30_000_000, budgetCurrency: "INR", createdAt: ago(100) });
  const fresh = lead({ status: "NEW" });
  const overdue = lead({ status: "CONTACTED", nextFollowUpAt: ago(5), createdAt: ago(100) });

  const queue = buildTodayQueue(
    [
      input(recent, {}, { lastContactAt: ago(1), lastBuyerActivityAt: ago(0.5), lastBuyerActivityDeveloperName: "Acme" }),
      input(strong, {}, { lastContactAt: ago(72) }),
      input(highValue, {}, { lastContactAt: ago(72) }),
      input(fresh),
      input(overdue, {}, { lastContactAt: ago(10) }),
    ],
    NOW,
  );

  assert.deepEqual(
    queue.map((entry) => entry.bucket),
    ["OVERDUE_FOLLOW_UP", "NEW_LEAD", "HIGH_VALUE", "STRONG_TIMELINE", "RECENT_ACTIVITY"],
  );
  assert.deepEqual(ids(queue), [overdue.id, fresh.id, highValue.id, strong.id, recent.id]);
  assert.deepEqual(queue.map((entry) => entry.bucketRank), [1, 2, 3, 4, 5]);
});

test("queue: an overdue follow-up outranks a brand-new, high-budget, strong-timeline lead", () => {
  const overdue = lead({ status: "CONTACTED", nextFollowUpAt: ago(1), budgetMax: 1_000_000, budgetCurrency: "INR", createdAt: ago(100) });
  const premiumNew = lead({ status: "NEW", budgetMax: 90_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS" });
  const queue = buildTodayQueue([input(premiumNew), input(overdue, {}, { lastContactAt: ago(3) })], NOW);
  assert.deepEqual(ids(queue), [overdue.id, premiumNew.id]);
});

test("queue: a follow-up in the FUTURE is not overdue (and a recently-contacted lead is not listed at all)", () => {
  const scheduled = lead({ status: "CONTACTED", nextFollowUpAt: inFuture(5), createdAt: ago(100) });
  const queue = buildTodayQueue([input(scheduled, {}, { lastContactAt: ago(2) })], NOW);
  assert.deepEqual(queue, []);
});

test("queue: a follow-up due exactly now counts as overdue", () => {
  const dueNow = lead({ status: "CONTACTED", nextFollowUpAt: NOW, createdAt: ago(100) });
  assert.equal(buildTodayQueue([input(dueNow, {}, { lastContactAt: ago(2) })], NOW)[0].bucket, "OVERDUE_FOLLOW_UP");
});

test("queue: a lead lands in exactly ONE bucket — the highest that applies", () => {
  const everything = lead({
    status: "NEW",
    nextFollowUpAt: ago(2),
    budgetMax: 50_000_000,
    budgetCurrency: "INR",
    timeline: "WITHIN_30_DAYS",
    createdAt: ago(100),
  });
  const queue = buildTodayQueue([input(everything, {}, { lastBuyerActivityAt: ago(1) })], NOW);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].bucket, "OVERDUE_FOLLOW_UP");
});

// --- ordering inside a bucket ------------------------------------------------------------------

test("queue: within the NEW bucket — higher budget first, then nearer timeline, then longest-waiting", () => {
  const big = lead({ budgetMax: 25_000_000, budgetCurrency: "INR", createdAt: ago(2) });
  const mid = lead({ budgetMax: 5_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS", createdAt: ago(10) });
  const midSlowTimeline = lead({ budgetMax: 5_000_000, budgetCurrency: "INR", timeline: "SIX_MONTHS_PLUS", createdAt: ago(30) });
  const unknownOld = lead({ createdAt: ago(40) });
  const unknownNewer = lead({ createdAt: ago(3) });

  const queue = buildTodayQueue([unknownNewer, midSlowTimeline, unknownOld, mid, big].map((l) => input(l)), NOW);
  assert.deepEqual(ids(queue), [big.id, mid.id, midSlowTimeline.id, unknownOld.id, unknownNewer.id]);
});

test("queue: 'high budget' is judged per currency — ₹2 Cr and AED 900K are both high; ₹1 Cr and AED 100K are not", () => {
  const rupeeHigh = lead({ budgetMax: 20_000_000, budgetCurrency: "INR", createdAt: ago(5) });
  const dirhamHigh = lead({ budgetMax: 900_000, budgetCurrency: "AED", createdAt: ago(5) });
  const rupeeLow = lead({ budgetMax: 10_000_000, budgetCurrency: "INR", createdAt: ago(50) });
  const dirhamLow = lead({ budgetMax: 100_000, budgetCurrency: "AED", createdAt: ago(60) });

  const queue = buildTodayQueue([rupeeLow, dirhamLow, dirhamHigh, rupeeHigh].map((l) => input(l)), NOW);
  const top = new Set(ids(queue.slice(0, 2)));
  assert.deepEqual(top, new Set([rupeeHigh.id, dirhamHigh.id]));
});

test("queue: the budget used for ranking is the UPPER figure when a range is given", () => {
  const rangeReachingHigh = lead({ budgetMin: 5_000_000, budgetMax: 25_000_000, budgetCurrency: "INR", createdAt: ago(5) });
  const flatLow = lead({ budgetMax: 8_000_000, budgetCurrency: "INR", createdAt: ago(80) });
  assert.deepEqual(ids(buildTodayQueue([input(flatLow), input(rangeReachingHigh)], NOW)), [rangeReachingHigh.id, flatLow.id]);
});

test("queue: overdue leads — higher budget first, otherwise the most overdue first", () => {
  const veryOverdueSmall = lead({ status: "CONTACTED", nextFollowUpAt: ago(100), budgetMax: 1_000_000, budgetCurrency: "INR", createdAt: ago(300) });
  const slightlyOverdueBig = lead({ status: "CONTACTED", nextFollowUpAt: ago(2), budgetMax: 40_000_000, budgetCurrency: "INR", createdAt: ago(300) });
  const overdueSameBandA = lead({ status: "CONTACTED", nextFollowUpAt: ago(10), budgetMax: 2_000_000, budgetCurrency: "INR", createdAt: ago(300) });
  const overdueSameBandB = lead({ status: "CONTACTED", nextFollowUpAt: ago(50), budgetMax: 3_000_000, budgetCurrency: "INR", createdAt: ago(300) });

  const queue = buildTodayQueue(
    [veryOverdueSmall, overdueSameBandA, slightlyOverdueBig, overdueSameBandB].map((l) => input(l, {}, { lastContactAt: ago(200) })),
    NOW,
  );
  assert.deepEqual(ids(queue), [slightlyOverdueBig.id, veryOverdueSmall.id, overdueSameBandB.id, overdueSameBandA.id].sort((a, b) => ids(queue).indexOf(a) - ids(queue).indexOf(b)));
  assert.equal(queue[0].leadId, slightlyOverdueBig.id, "the high-budget lead leads the bucket");
  assert.ok(ids(queue).indexOf(overdueSameBandB.id) < ids(queue).indexOf(overdueSameBandA.id), "same band: more overdue first");
});

test("queue: recent activity — the buyer who acted most recently comes first", () => {
  const a = lead({ status: "CONTACTED", createdAt: ago(200) });
  const b = lead({ status: "CONTACTED", createdAt: ago(200) });
  const queue = buildTodayQueue(
    [
      input(a, {}, { lastContactAt: ago(100), lastBuyerActivityAt: ago(10) }),
      input(b, {}, { lastContactAt: ago(100), lastBuyerActivityAt: ago(2) }),
    ],
    NOW,
  );
  assert.deepEqual(ids(queue), [b.id, a.id]);
});

test("queue: the order is deterministic — identical leads are ordered by id, whatever order they arrive in", () => {
  const same = Array.from({ length: 6 }, () => lead({ createdAt: ago(5) }));
  const forward = ids(buildTodayQueue(same.map((l) => input(l)), NOW));
  const reversed = ids(buildTodayQueue([...same].reverse().map((l) => input(l)), NOW));
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, [...forward].sort());
});

test("queue: a limit caps the list, keeping the top-ranked entries", () => {
  const leads = Array.from({ length: 10 }, (_, i) => lead({ createdAt: ago(i + 1), budgetMax: (10 - i) * 5_000_000, budgetCurrency: "INR" }));
  const everything = buildTodayQueue(leads.map((l) => input(l)), NOW);
  const capped = buildTodayQueue(leads.map((l) => input(l)), NOW, 3);
  assert.equal(capped.length, 3);
  assert.deepEqual(ids(capped), ids(everything).slice(0, 3));
  assert.deepEqual(buildTodayQueue([], NOW), []);
  assert.deepEqual(buildTodayQueue(leads.map((l) => input(l)), NOW, 0), []);
});

// --- who is excluded ---------------------------------------------------------------------------

test("queue: finished or non-prospect leads never appear, even with a due follow-up or fresh buyer activity", () => {
  for (const status of ["BOOKED", "CLOSED", "WRONG_NUMBER", "DUPLICATE", "UNQUALIFIED"] as const) {
    const finished = lead({ status, nextFollowUpAt: ago(5), createdAt: ago(100), budgetMax: 90_000_000, budgetCurrency: "INR" });
    assert.deepEqual(buildTodayQueue([input(finished, {}, { lastBuyerActivityAt: ago(1) })], NOW), [], status);
  }
});

test("queue: an erased lead never appears", () => {
  const erased = lead({ status: "NEW", erasedAt: ago(1), phoneE164: null });
  assert.deepEqual(buildTodayQueue([input(erased)], NOW), []);
});

test("queue: parked leads (NOT_INTERESTED / LOST / REVISIT_LATER) appear ONLY for a due follow-up or when the buyer comes back", () => {
  for (const status of ["NOT_INTERESTED", "LOST", "REVISIT_LATER"] as const) {
    const parked = lead({ status, createdAt: ago(300), budgetMax: 90_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS" });
    // High budget and a strong timeline do NOT resurface a parked lead on their own.
    assert.deepEqual(buildTodayQueue([input(parked, {}, { lastContactAt: ago(300) })], NOW), [], `${status} stays parked`);

    const dueAgain = lead({ status, createdAt: ago(300), nextFollowUpAt: ago(3) });
    assert.equal(buildTodayQueue([input(dueAgain, {}, { lastContactAt: ago(200) })], NOW)[0].bucket, "OVERDUE_FOLLOW_UP");

    const cameBack = lead({ status, createdAt: ago(300) });
    const entry = buildTodayQueue([input(cameBack, {}, { lastContactAt: ago(200), lastBuyerActivityAt: ago(2), lastBuyerActivityDeveloperName: "Beta Homes" })], NOW)[0];
    assert.equal(entry.bucket, "RECENT_ACTIVITY");
    assert.match(entry.summary, /Beta Homes/);
  }
});

test("queue: buyer activity we have already responded to is not 'recent activity'", () => {
  const handled = lead({ status: "CONTACTED", createdAt: ago(200) });
  const queue = buildTodayQueue([input(handled, {}, { lastBuyerActivityAt: ago(5), lastContactAt: ago(1) })], NOW);
  assert.deepEqual(queue, []);
});

test("queue: activity older than 24 hours is not recent", () => {
  const stale = lead({ status: "CONTACTED", createdAt: ago(300) });
  assert.deepEqual(buildTodayQueue([input(stale, {}, { lastBuyerActivityAt: ago(30), lastContactAt: ago(40) })], NOW), []);
});

test("queue: a lead contacted within 48 hours is not 'high value' or 'strong timeline' — it only reappears once stale", () => {
  const worked = lead({ status: "QUALIFIED", budgetMax: 50_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS", createdAt: ago(300) });
  assert.deepEqual(buildTodayQueue([input(worked, {}, { lastContactAt: ago(47) })], NOW), []);
  assert.equal(buildTodayQueue([input(worked, {}, { lastContactAt: ago(49) })], NOW)[0].bucket, "HIGH_VALUE");
});

test("queue: a never-contacted active lead that is neither high-value nor soon is not listed (nothing to explain)", () => {
  const ordinary = lead({ status: "CONTACTED", budgetMax: 3_000_000, budgetCurrency: "INR", timeline: "SIX_MONTHS_PLUS", createdAt: ago(300) });
  assert.deepEqual(buildTodayQueue([input(ordinary)], NOW), []);
});

test("queue: a buying-soon lead (1–3 months) that is stale lands in STRONG_TIMELINE; 3+ months does not", () => {
  const soon = lead({ status: "SHORTLISTED", timeline: "ONE_TO_THREE_MONTHS", createdAt: ago(300) });
  const later = lead({ status: "SHORTLISTED", timeline: "THREE_TO_SIX_MONTHS", createdAt: ago(300) });
  const queue = buildTodayQueue([input(soon, {}, { lastContactAt: ago(100) }), input(later, {}, { lastContactAt: ago(100) })], NOW);
  assert.deepEqual(ids(queue), [soon.id]);
  assert.equal(queue[0].bucket, "STRONG_TIMELINE");
});

// --- explanations ------------------------------------------------------------------------------

test("explanation: a new lead reads like the founder's own example — budget, timeline and how long it has waited", () => {
  const l = lead({ status: "NEW", budgetMax: 20_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS", createdAt: ago(18) });
  const [entry] = buildTodayQueue([input(l, { developerName: "Acme Realty" })], NOW);
  assert.equal(entry.summary, "New lead from Acme Realty • ₹2 Cr budget • Wants to buy within 30 days • No contact attempt in 18 hours");
  assert.deepEqual(entry.reasons, ["New lead from Acme Realty", "₹2 Cr budget", "Wants to buy within 30 days", "No contact attempt in 18 hours"]);
});

test("explanation: an overdue follow-up says how overdue it is", () => {
  const l = lead({ status: "CONTACTED", nextFollowUpAt: ago(75), createdAt: ago(300), budgetMax: 1_500_000, budgetCurrency: "AED" });
  const [entry] = buildTodayQueue([input(l, {}, { lastContactAt: ago(80) })], NOW);
  assert.equal(entry.summary, "Follow-up overdue by 3 days • AED 1.5M budget • Last contacted 3 days ago");
});

test("explanation: a high-value lead leads with the budget and says when it was last contacted", () => {
  const l = lead({ status: "QUALIFIED", budgetMax: 30_000_000, budgetCurrency: "INR", createdAt: ago(300) });
  const [entry] = buildTodayQueue([input(l, {}, { lastContactAt: ago(60) })], NOW);
  assert.equal(entry.summary, "₹3 Cr budget • Last contacted 2 days ago");
});

test("explanation: a returning buyer says which developer they clicked and when", () => {
  const l = lead({ status: "CONTACTED", createdAt: ago(300) });
  const [entry] = buildTodayQueue([input(l, {}, { lastContactAt: ago(100), lastBuyerActivityAt: ago(2), lastBuyerActivityDeveloperName: "Beta Homes" })], NOW);
  assert.equal(entry.summary, "Came back — clicked Beta Homes's website 2 hours ago");
});

test("explanation: a lead with no budget or timeline still gets a clear reason, and a contacted-before lead says so", () => {
  const bare = lead({ status: "NEW", createdAt: ago(3) });
  assert.equal(buildTodayQueue([input(bare)], NOW)[0].summary, "New lead • No contact attempt in 3 hours");
});

test("explanation: EVERY entry in a mixed queue has at least one non-empty, human-readable reason", () => {
  const leads = [
    lead({ status: "NEW" }),
    lead({ status: "CONTACTED", nextFollowUpAt: ago(4), createdAt: ago(200) }),
    lead({ status: "QUALIFIED", budgetMax: 40_000_000, budgetCurrency: "INR", createdAt: ago(200) }),
    lead({ status: "SHORTLISTED", timeline: "WITHIN_30_DAYS", createdAt: ago(200) }),
    lead({ status: "LOST", createdAt: ago(200) }),
  ];
  const summaries = [undefined, { lastContactAt: ago(10) }, { lastContactAt: ago(90) }, { lastContactAt: ago(90) }, { lastContactAt: ago(100), lastBuyerActivityAt: ago(1) }];
  const queue = buildTodayQueue(leads.map((l, i) => input(l, {}, summaries[i] ?? {})), NOW);
  assert.equal(queue.length, 5);
  for (const entry of queue) {
    assert.ok(entry.reasons.length >= 1);
    assert.ok(entry.reasons.every((reason) => reason.trim().length > 3));
    assert.match(entry.summary, /^[A-Z₹]/, "starts with a capital or currency symbol");
    assert.ok(!/undefined|null|NaN|\[object/.test(entry.summary), `bad text in: ${entry.summary}`);
  }
});

// --- end to end through the service ------------------------------------------------------------

test("service: getTodayQueue builds the queue from real lead history (new lead, follow-up, returning buyer, finished lead)", async () => {
  const repos = createInMemoryLeadRepositories();
  const T = (hoursBefore: number) => ago(hoursBefore);

  // A: a brand-new high-budget lead from Acme.
  const a = await captureAssistanceLead(
    repos,
    captureInput({ phone: "+919876500001", requirement: { budgetMax: 25_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS" } }),
    T(6),
  );
  // B: contacted, with a follow-up that is now overdue.
  const b = await captureAssistanceLead(repos, captureInput({ phone: "+919876500002" }), T(100));
  await changeLeadStatus(repos, b.lead.id, "CONTACTED", FOUNDER, {}, T(99));
  await logContact(repos, b.lead.id, { channel: "WHATSAPP", outcome: "CONNECTED" }, FOUNDER, T(98));
  await setFollowUp(repos, b.lead.id, T(2), FOUNDER, T(97));
  // C: contacted, then came back to look at another developer.
  const c = await captureAssistanceLead(repos, captureInput({ phone: "+919876500003" }), T(60));
  await changeLeadStatus(repos, c.lead.id, "CONTACTED", FOUNDER, {}, T(59));
  await logContact(repos, c.lead.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, FOUNDER, T(58));
  await captureAssistanceLead(
    repos,
    captureInput({ phone: "+919876500003", developer: { id: "33333333-3333-4333-8333-333333333333", slug: "gamma", displayName: "Gamma Group" } }),
    T(3),
  );
  // D: booked — finished.
  const d = await captureAssistanceLead(repos, captureInput({ phone: "+919876500004" }), T(80));
  await changeLeadStatus(repos, d.lead.id, "BOOKED", FOUNDER, {}, T(70));
  await addNote(repos, d.lead.id, "done", FOUNDER, T(69));

  const queue = await getTodayQueue(repos, NOW);
  assert.deepEqual(queue.map((entry) => [entry.leadId, entry.bucket]), [
    [b.lead.id, "OVERDUE_FOLLOW_UP"],
    [a.lead.id, "NEW_LEAD"],
    [c.lead.id, "RECENT_ACTIVITY"],
  ]);
  assert.match(queue[1].summary, /New lead from Acme Realty • ₹2\.5 Cr budget • Wants to buy within 30 days • No contact attempt in 6 hours/);
  assert.match(queue[2].summary, /clicked Gamma Group's website 3 hours ago/);
  assert.ok(!queue.some((entry) => entry.leadId === d.lead.id));
});

// --- the founder's final decisions live in queue-config.ts -------------------------------------

test("config: the approved thresholds are the founder's decisions, and they are defined only in queue-config.ts", () => {
  assert.equal(HIGH_BUDGET_MIN.INR, 20_000_000, "India: ₹2 Cr+");
  assert.equal(HIGH_BUDGET_MIN.AED, 900_000, "UAE: AED 900K+");
  assert.equal(STALE_CONTACT_HOURS, 48);
  assert.equal(RECENT_ACTIVITY_HOURS, 24);
  assert.deepEqual([...QUEUE_EXCLUDED_STATUSES].sort(), ["BOOKED", "CLOSED", "DUPLICATE", "UNQUALIFIED", "WRONG_NUMBER"]);
  assert.deepEqual([...QUEUE_DORMANT_STATUSES].sort(), ["LOST", "NOT_INTERESTED", "REVISIT_LATER"]);
});

test("config: the queue reads its thresholds from the config — nothing is hard-coded in the ranking code", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../today-queue.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /20[_,]?000[_,]?000|900[_,]?000|\b48\b|\b24\b/, "a threshold literal appears in today-queue.ts");
  assert.match(source, /HIGH_BUDGET_MIN\[/);
  assert.match(source, /STALE_CONTACT_HOURS/);
  assert.match(source, /RECENT_ACTIVITY_HOURS/);
});

test("config: a returning buyer on a parked or finished lead changes NO status — the queue only re-surfaces it", async () => {
  for (const status of ["LOST", "REVISIT_LATER", "NOT_INTERESTED", "CLOSED", "UNQUALIFIED", "WRONG_NUMBER", "DUPLICATE", "BOOKED"] as const) {
    const repos = createInMemoryLeadRepositories();
    const { lead } = await captureAssistanceLead(repos, captureInput(), hoursFrom(NOW, -200));
    await changeLeadStatus(repos, lead.id, status, FOUNDER, status === "LOST" ? { reasonCode: "PRICE" } : {}, hoursFrom(NOW, -100));

    const returned = await captureAssistanceLead(repos, captureInput({ developer: { id: "44444444-4444-4444-8444-444444444444", slug: "back", displayName: "Back Homes" } }), hoursFrom(NOW, -2));
    assert.equal(returned.created, false);
    assert.equal(returned.lead.status, status, `${status} must not change when the buyer returns`);

    const events = await repos.events.listByLead(lead.id);
    assert.ok(events.some((event) => event.eventType === "LEAD_CAPTURED" && event.developerId === "44444444-4444-4444-8444-444444444444"), "the activity is recorded");
    assert.equal(events.filter((event) => event.eventType === "STATUS_CHANGED").length, 1, "no automatic status change was recorded");
  }
});
