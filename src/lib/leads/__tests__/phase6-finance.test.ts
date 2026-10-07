import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFinanceReport, moneyMetrics } from "../finance.ts";
import { getFinanceView, recordSpend, voidSpend, listSpend, businessDate } from "../finance-service.ts";
import type { AcquisitionBooking, AcquisitionRow, TouchEvidence } from "../acquisition.ts";
import { captureAssistanceLead, createBooking, updateBooking, changeLeadStatus, getLeadTimeline } from "../lead-service.ts";
import { createCampaign } from "../campaign-service.ts";
import { createProject } from "../project-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import type { MarketingSpend } from "../types.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Phase 6: unit economics (pure), spend handling, booking/commission links - in memory. */

const touch = (over: Partial<TouchEvidence> = {}): TouchEvidence => ({ utmSource: null, utmMedium: null, utmCampaign: null, gclid: null, fbclid: null, referrer: null, landingPath: "/", ...over });
const booking = (over: Partial<AcquisitionBooking> = {}): AcquisitionBooking => ({ currency: "INR", bookingValue: 10_000_000, commissionExpected: 200_000, commissionReceived: 100_000, projectId: null, projectName: null, ...over });
const row = (over: Partial<AcquisitionRow> = {}): AcquisitionRow => ({ leadId: "l", createdAt: T0, sourceType: "DIGITAL", creationMethod: "WEBSITE_GATE", first: touch({ gclid: "g" }), latest: touch({ gclid: "g" }), reachedQualified: false, hasSiteVisit: false, booked: false, bookings: [], ...over });
const spend = (over: Partial<MarketingSpend> = {}): MarketingSpend => ({ id: "s", channel: "GOOGLE_ADS", campaignId: null, spentOn: "2026-10-05", currency: "INR", amount: 10_000, note: null, createdBy: "f", createdAt: T0, voidedAt: null, voidedBy: null, voidReason: null, ...over });

test("metrics: every ratio is computed inside one currency and is null (a dash) when its denominator is zero", () => {
  const m = moneyMetrics({ leads: 10, qualified: 4, siteVisits: 2, bookings: 1 }, { spend: 50_000, bookingValue: 10_000_000, commissionExpected: 200_000, commissionReceived: 100_000, bookings: 1 });
  assert.deepEqual([m.cpl, m.cpql, m.costPerSiteVisit, m.costPerBooking], [5_000, 12_500, 25_000, 50_000]);
  assert.deepEqual([m.roas, m.roi, m.profit, m.outstanding], [2, 1, 50_000, 100_000]);
  assert.deepEqual([m.revenuePerLead, m.revenuePerQualified, m.revenuePerSiteVisit, m.revenuePerBooking], [10_000, 25_000, 50_000, 100_000]);
  const none = moneyMetrics({ leads: 0, qualified: 0, siteVisits: 0, bookings: 0 }, { spend: 0, bookingValue: 0, commissionExpected: 0, commissionReceived: 0, bookings: 0 });
  for (const v of [none.cpl, none.cpql, none.costPerSiteVisit, none.costPerBooking, none.roas, none.roi, none.revenuePerLead, none.revenuePerBooking]) assert.equal(v, null);
  assert.equal(moneyMetrics({ leads: 1, qualified: 0, siteVisits: 0, bookings: 0 }, { spend: 100, bookingValue: 0, commissionExpected: 0, commissionReceived: 0, bookings: 0 }).roi, -1, "money spent and nothing back is -100%, not a dash");
});

test("report: INR and AED are NEVER mixed or converted - each currency has its own spend, revenue and ratios", () => {
  const rows = [row({ leadId: "1", reachedQualified: true, booked: true, bookings: [booking({ currency: "INR" })] }), row({ leadId: "2", booked: true, bookings: [booking({ currency: "AED", commissionExpected: 5000, commissionReceived: 5000, bookingValue: 900_000 })] })];
  const report = buildFinanceReport(rows, [spend({ amount: 20_000, currency: "INR" }), spend({ id: "s2", amount: 1_000, currency: "AED" })], [], new Map(), "first");
  const google = report.byChannel.find((g) => g.key === "GOOGLE_ADS")!;
  assert.deepEqual([google.money.INR?.spend, google.money.INR?.commissionReceived, google.money.INR?.bookings], [20_000, 100_000, 1]);
  assert.deepEqual([google.money.AED?.spend, google.money.AED?.commissionReceived, google.money.AED?.bookings], [1_000, 5_000, 1]);
  assert.equal(google.money.INR?.roas, 5);
  assert.equal(google.money.AED?.roas, 5);
  assert.equal(google.counts.leads, 2, "counts are not money and are shared");
  assert.equal(Object.keys(report.totals.money).sort().join(), "AED,INR");
  // No cross-currency figure exists anywhere in the report.
  assert.doesNotMatch(JSON.stringify(report), /"total(Spend|Revenue)"/);
});

test("report: voided spend counts for nothing; spend with no leads still shows (a channel that costs money and brings nobody); campaign spend is attributed by id", () => {
  const rows = [row({ leadId: "1", first: touch({ utmCampaign: "spring", gclid: "g" }) })];
  const report = buildFinanceReport(
    rows,
    [spend({ amount: 10_000, campaignId: "c1" }), spend({ id: "v", amount: 999_999, voidedAt: T0, voidedBy: "f", voidReason: "typo" }), spend({ id: "m", channel: "META", amount: 7_000 })],
    [{ id: "c1", name: "Spring sale", utmCampaign: "spring" }],
    new Map(),
    "first",
  );
  assert.equal(report.byChannel.find((g) => g.key === "GOOGLE_ADS")!.money.INR!.spend, 10_000, "the voided 999,999 is ignored");
  const meta = report.byChannel.find((g) => g.key === "META")!;
  assert.deepEqual([meta.counts.leads, meta.money.INR!.spend, meta.money.INR!.cpl], [0, 7_000, null], "spend with no leads: cost per lead is a dash, not zero");
  const camp = report.byCampaign.find((g) => g.key === "c1")!;
  assert.deepEqual([camp.label, camp.counts.leads, camp.money.INR!.spend, camp.money.INR!.cpl], ["Spring sale", 1, 10_000, 10_000]);
});

test("report: project revenue groups bookings by the recorded project (or name) and never invents a cost", () => {
  const rows = [
    row({ leadId: "1", booked: true, bookings: [booking({ projectId: "p1" }), booking({ projectName: "Old Tower", commissionReceived: 0 })] }),
    row({ leadId: "2", booked: true, bookings: [booking({})] }),
  ];
  const report = buildFinanceReport(rows, [], [], new Map([["p1", "Acme Heights"]]), "first");
  assert.deepEqual(report.byProject.map((g) => [g.label, g.money.INR!.bookings]).sort(), [["Acme Heights", 1], ["Not linked to a recorded project", 1], ["Old Tower", 1]].sort());
  for (const g of report.byProject) assert.equal(g.money.INR!.spend, 0, "no spend is allocated to a project");
});

// --- spend (Founder only, immutable, voidable) ------------------------------------------------------

test("spend: Founder only; validated (channel, currency, whole positive amount, real non-future date, known campaign); void needs a reason and works once", async () => {
  const repos = createInMemoryLeadRepositories();
  const employee = { actorType: "EMPLOYEE" as const, actorId: "e" };
  const now = new Date("2026-10-07T10:00:00Z");
  const ok = { channel: "GOOGLE_ADS", spentOn: "2026-10-06", currency: "INR" as const, amount: 5000 };
  await assert.rejects(recordSpend(repos, ok, employee, now), UnauthorizedLeadActionError);
  await assert.rejects(listSpend(repos, employee, { from: now, to: now }), UnauthorizedLeadActionError);
  for (const bad of [{ channel: "TIKTOK" }, { currency: "USD" as never }, { amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: 1e13 }, { spentOn: "2026-13-01" }, { spentOn: "yesterday" }, { spentOn: "2026-10-09" }, { spentOn: "2019-12-31" }, { note: "x".repeat(201) }, { campaignId: "00000000-0000-4000-8000-000000000000" }]) {
    await assert.rejects(recordSpend(repos, { ...ok, ...bad }, FOUNDER, now), LeadValidationError, JSON.stringify(bad));
  }
  assert.equal(businessDate(new Date("2026-10-07T20:00:00Z")), "2026-10-08", "the India calendar day, not UTC");
  const entry = await recordSpend(repos, { ...ok, note: "  Diwali boost " }, FOUNDER, now);
  assert.equal(entry.note, "Diwali boost");
  await assert.rejects(voidSpend(repos, entry.id, "  ", FOUNDER, now), LeadValidationError);
  await assert.rejects(voidSpend(repos, entry.id, "typo", employee, now), UnauthorizedLeadActionError);
  await assert.rejects(voidSpend(repos, "00000000-0000-4000-8000-000000000000", "typo", FOUNDER, now), LeadNotFoundError);
  const voided = await voidSpend(repos, entry.id, "typo", FOUNDER, now);
  assert.deepEqual([voided.voidedBy, voided.voidReason, voided.amount], [FOUNDER.actorId, "typo", 5000], "the amount is never changed");
  await assert.rejects(voidSpend(repos, entry.id, "again", FOUNDER, now), LeadStateError);
});

// --- bookings, commission, outstanding --------------------------------------------------------------

test("booking: linked to a recorded project, moves the lead to BOOKED (forward only), records commission received, and outstanding is derived", async () => {
  const repos = createInMemoryLeadRepositories({ "11111111-1111-4111-8111-111111111111": "Acme" });
  const { lead } = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 47777" }), T0);
  const project = await createProject(repos, { developerId: "11111111-1111-4111-8111-111111111111", name: "Acme Heights", city: "Thane" }, FOUNDER, minutes(2));
  await assert.rejects(createBooking(repos, lead.id, { currency: "INR", bookingValue: 1, projectId: "00000000-0000-4000-8000-000000000000" }, FOUNDER, minutes(3)), LeadValidationError);
  const b = await createBooking(repos, lead.id, { currency: "AED", bookingValue: 2_000_000, commissionExpected: 40_000, projectId: project.id }, FOUNDER, minutes(5));
  assert.deepEqual([b.projectId, b.projectName, b.currency], [project.id, "Acme Heights", "AED"]);
  assert.equal((await repos.leads.getById(lead.id))?.status, "BOOKED");
  assert.ok((await getLeadTimeline(repos, lead.id)).some((e) => e.eventType === "STATUS_CHANGED" && e.toStatus === "BOOKED" && e.actorType === "SYSTEM"));
  assert.equal((await repos.bookings.listOutstanding(10)).length, 1);
  await updateBooking(repos, b.id, { commissionReceived: 40_000, commissionReceivedAt: minutes(9) }, FOUNDER, minutes(9));
  assert.equal((await repos.bookings.listOutstanding(10)).length, 0, "fully received is no longer outstanding");
  await assert.rejects(updateBooking(repos, b.id, { commissionReceived: 1 }, { actorType: "EMPLOYEE", actorId: "e" }, minutes(10)), UnauthorizedLeadActionError);
  // A later manual loss is never overridden by the system.
  await changeLeadStatus(repos, lead.id, "LOST", FOUNDER, { reasonCode: "OTHER" }, minutes(11));
  assert.equal((await repos.leads.getById(lead.id))?.status, "LOST");
});

test("finance view from real records: leads, spend, bookings and outstanding come together per currency; employees cannot read it", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 48888", currentTouch: { sessionId: "s", landingPath: "/developers/a", gclid: "g", utmCampaign: "spring" } }), T0);
  await createCampaign(repos, { name: "Spring", utmCampaign: "spring" }, FOUNDER);
  await changeLeadStatus(repos, lead.id, "QUALIFIED", FOUNDER, {}, minutes(5));
  await createBooking(repos, lead.id, { currency: "INR", bookingValue: 5_000_000, commissionExpected: 100_000 }, FOUNDER, minutes(10));
  const now = new Date(T0.getTime() + 2 * 86_400_000);
  const day = businessDate(T0);
  await recordSpend(repos, { channel: "GOOGLE_ADS", spentOn: day, currency: "INR", amount: 25_000 }, FOUNDER, now);
  const view = await getFinanceView(repos, FOUNDER, { from: new Date(T0.getTime() - 3_600_000), to: new Date(T0.getTime() + 86_400_000) });
  const google = view.report.byChannel.find((g) => g.key === "GOOGLE_ADS")!;
  assert.deepEqual([google.counts.leads, google.counts.qualified, google.counts.bookings, google.money.INR!.spend, google.money.INR!.cpl, google.money.INR!.outstanding], [1, 1, 1, 25_000, 25_000, 100_000]);
  assert.equal(view.outstandingTotals.INR, 100_000);
  assert.equal(view.outstandingTotals.AED, undefined);
  await assert.rejects(getFinanceView(repos, { actorType: "EMPLOYEE", actorId: "e" }, { from: T0, to: now }), UnauthorizedLeadActionError);
  assert.doesNotMatch(JSON.stringify(view), /98765|@/);
});

// --- static guarantees ------------------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: finance pages and actions are Founder-gated; the report has no cross-currency sum; migration 0025 is additive and makes spend immutable", () => {
  for (const file of ["src/app/admin/finance/page.tsx", "src/app/admin/spend/page.tsx"]) {
    const text = read(file);
    assert.match(text, /await requireFounder\(\)/);
    assert.match(text, /robots: \{ index: false, follow: false \}/);
    assert.match(text, /export const dynamic = "force-dynamic"/);
  }
  const actions = read("src/app/admin/_actions/finance-actions.ts");
  for (const name of ["createBookingAction", "recordCommissionReceivedAction", "recordSpendAction", "voidSpendAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    const open = body.indexOf("Promise<FinanceActionResult> {") + "Promise<FinanceActionResult> {".length;
    assert.match(body.slice(open).trimStart(), /^const founderId = await requireFounderForAction\(\);/, `${name} authorizes first`);
  }
  const finance = read("src/lib/leads/finance.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(finance, /exchange|fxRate|convert|usd/i, "no exchange-rate assumption exists");
  const sql = read("src/lib/developer-connect/db/migrations/0025_phase6_marketing_spend.sql");
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  assert.match(sql, /DELETE is not permitted \(void the entry instead\)/);
  assert.match(sql, /an entry cannot be edited/);
});
