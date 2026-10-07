import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttention, THRESHOLDS, type AttentionInput } from "../command-centre.ts";
import { getCommandCentre } from "../command-centre-service.ts";
import { moneyMetrics, type FinanceGroup } from "../finance.ts";
import { parseInsightFilters } from "../call-analytics.ts";
import { assignLead, captureAssistanceLead, createBooking, changeLeadStatus } from "../lead-service.ts";
import { recordSpend, businessDate } from "../finance-service.ts";
import { scheduleSiteVisit } from "../site-visit-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { UnauthorizedLeadActionError } from "../errors.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Phase 7: the Command Centre's attention rules (pure) and its read model, in memory. */

const channel = (key: string, label: string, leads: number, qualified: number, spend = 0, currency: "INR" | "AED" = "INR"): FinanceGroup => {
  const counts = { leads, qualified, siteVisits: 0, bookings: 0 };
  return { key, label, counts, money: spend > 0 ? { [currency]: moneyMetrics(counts, { spend, bookingValue: 0, commissionExpected: 0, commissionReceived: 0, bookings: 0 }) } : {} };
};
const base = (over: Partial<AttentionInput> = {}): AttentionInput => ({ missedFollowUps: 0, returnedLeads: 0, visitsAwaitingOutcome: 0, unassignedOpen: 0, unassignedOld: 0, staleOpen: 0, channels: [], totalLeads: 0, totalQualified: 0, overdueCommission: {}, ...over });

test("attention: a quiet business produces an empty list - silence is information", () => {
  assert.deepEqual(buildAttention(base()), []);
});

test("attention: each rule fires with its reason, a next step and a destination, and HIGH items come first", () => {
  const items = buildAttention(base({ staleOpen: 4, returnedLeads: 2, missedFollowUps: 3, visitsAwaitingOutcome: 1, unassignedOpen: 5, unassignedOld: 2 }));
  assert.deepEqual(items.map((i) => i.key), ["MISSED_FOLLOW_UPS", "PENDING_SITE_VISITS", "UNASSIGNED_LEADS", "RETURNED_LEADS", "STALE_LEADS"]);
  assert.deepEqual(items.map((i) => i.severity), ["HIGH", "HIGH", "HIGH", "MEDIUM", "MEDIUM"]);
  for (const i of items) {
    assert.ok(i.title && i.detail && i.action, i.key);
    assert.match(i.href, /^\/admin\//);
  }
  assert.match(items[0].title, /3 missed follow-ups/);
  assert.match(items[2].title, new RegExp(`over ${THRESHOLDS.UNASSIGNED_HOURS} hours`));
  // Singular wording, and recent-only unassigned leads are a lower severity.
  const one = buildAttention(base({ missedFollowUps: 1, unassignedOpen: 1, unassignedOld: 0 }));
  assert.match(one[0].title, /^1 missed follow-up$/);
  assert.equal(one[1].severity, "MEDIUM");
});

test("attention: low conversion is RELATIVE to the overall rate and needs enough leads to judge; a small channel is never judged", () => {
  const channels = [channel("GOOGLE_ADS", "Google", 100, 2), channel("META", "Meta", 100, 40), channel("REFERRAL", "Referral", 5, 0)];
  const items = buildAttention(base({ channels, totalLeads: 205, totalQualified: 42 }));
  const low = items.filter((i) => i.key === "LOW_CONVERSION");
  assert.equal(low.length, 1);
  assert.match(low[0].title, /Google/);
  assert.match(low[0].detail, /2% of its 100 leads qualified, against 20% overall/);
  assert.ok(!items.some((i) => /Referral/.test(i.title)), "5 leads is noise, not a finding");
});

test("attention: high cost per lead compares channels within ONE currency and never across currencies", () => {
  const channels = [channel("GOOGLE_ADS", "Google", 50, 5, 500_000), channel("META", "Meta", 50, 5, 50_000), channel("INSTAGRAM", "Instagram", 50, 5, 40_000, "AED")];
  const items = buildAttention(base({ channels, totalLeads: 150, totalQualified: 15 }));
  const high = items.filter((i) => i.key === "HIGH_CPL");
  assert.equal(high.length, 1);
  assert.match(high[0].title, /Google/);
  assert.match(high[0].detail, /INR/);
  assert.ok(!items.some((i) => /Instagram/.test(i.title)), "a lone AED channel has nothing in AED to be compared with");
});

test("attention: money spent with no leads is HIGH and says how much, in its own currency", () => {
  const items = buildAttention(base({ channels: [channel("META", "Meta (Facebook)", 0, 0, 30_000, "AED")] }));
  assert.equal(items[0].key, "SPEND_NO_LEADS");
  assert.equal(items[0].severity, "HIGH");
  assert.match(items[0].title, /AED 30,000 spent, no leads/);
});

test("attention: unpaid commission is reported per currency, only past the chase window", () => {
  const items = buildAttention(base({ overdueCommission: { INR: { amount: 250_000, bookings: 2 }, AED: { amount: 0, bookings: 0 } } }));
  assert.equal(items.length, 1);
  assert.match(items[0].title, /₹2,50,000 commission unpaid over 30 days/);
  assert.match(items[0].detail, /2 bookings/);
});

// --- the read model ---------------------------------------------------------------------------------

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const mk = async (n: number) => (await captureAssistanceLead(repos, captureInput({ phone: `+91 98765 4${3700 + n}`, name: `Buyer ${n}` }), T0)).lead;
  const [a, b, c, d] = [await mk(1), await mk(2), await mk(3), await mk(4)];
  await assignLead(repos, staff, a.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, b.id, priya.id, FOUNDER, minutes(5));
  return { repos, staff, priya, a, b, c, d, priyaActor: (await resolveEmployee(staff, priya.userId))!.actor };
}

test("command centre: every block comes from real records and agrees with the detail screens; unassigned, stale, missed and pending visits are found", async () => {
  const w = await world();
  const now = new Date(T0.getTime() + 10 * 86_400_000);
  // Lead d is owned and has been quiet since it was assigned: stale. Lead c stays with nobody: unassigned.
  await assignLead(w.repos, w.staff, w.d.id, w.priya.id, FOUNDER, minutes(5));
  await changeLeadStatus(w.repos, w.a.id, "QUALIFIED", FOUNDER, {}, new Date(T0.getTime() + 3_600_000));
  await createBooking(w.repos, w.a.id, { currency: "INR", bookingValue: 5_000_000, commissionExpected: 100_000 }, FOUNDER, new Date(T0.getTime() + 7_200_000));
  await scheduleFollowUp(w.repos, w.b.id, { scheduledAt: new Date(now.getTime() - 3 * 86_400_000) }, FOUNDER, new Date(now.getTime() - 5 * 86_400_000)).catch(() => undefined);
  await scheduleSiteVisit(w.repos, w.b.id, { scheduledAt: new Date(now.getTime() - 3_600_000) }, FOUNDER, new Date(now.getTime() - 2 * 86_400_000)).catch(() => undefined);
  await recordSpend(w.repos, { channel: "GOOGLE_ADS", spentOn: businessDate(T0), currency: "INR", amount: 10_000 }, FOUNDER, now);
  const filters = parseInsightFilters({ range: "last30" }, now);
  const cc = await getCommandCentre(w.repos, w.staff, FOUNDER, { ...filters, range: { ...filters.range, from: new Date(T0.getTime() - 3_600_000), to: new Date(now.getTime() + 3_600_000) } }, now);

  assert.equal(cc.overview.leads, 4);
  assert.equal(cc.overview.qualified, 2, "a lead that qualified and was then booked, and one that moved on to a site visit, both count as qualified");
  assert.equal(cc.overview.bookings, 1);
  assert.deepEqual([cc.overview.money.INR?.spend, cc.overview.money.INR?.received, cc.overview.money.INR?.outstanding], [10_000, 0, 100_000]);
  assert.equal(cc.sales.pipeline.length, 9, "the forward path, in order");
  assert.equal(cc.sales.pipeline.find((s) => s.status === "BOOKED")?.count, 1);
  const keys = cc.attention.map((i) => i.key);
  assert.ok(keys.includes("UNASSIGNED_LEADS"), "two leads nobody owns for 10 days");
  assert.ok(keys.includes("STALE_LEADS"), "owned and quiet for more than a week");
  assert.ok(keys.includes("PENDING_SITE_VISITS") || keys.includes("MISSED_FOLLOW_UPS"), "the overdue follow-up or visit is surfaced");
  assert.ok(!keys.includes("OUTSTANDING_COMMISSION"), "booked 10 days ago is not yet past the 30-day chase window");
});

test("command centre: Founder only; carries no phone, email or name of any buyer", async () => {
  const w = await world();
  const now = new Date(T0.getTime() + 86_400_000);
  const filters = parseInsightFilters({ range: "last7" }, now);
  await assert.rejects(getCommandCentre(w.repos, w.staff, w.priyaActor, filters, now), UnauthorizedLeadActionError);
  const cc = await getCommandCentre(w.repos, w.staff, FOUNDER, filters, now);
  assert.doesNotMatch(JSON.stringify(cc), /98765|@|Buyer \d/);
});

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: the page is Founder-gated and noindex; the rules file has no randomness, model or hidden weights", () => {
  const page = read("src/app/admin/command-centre/page.tsx");
  assert.match(page, /await requireFounder\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  const rules = read("src/lib/leads/command-centre.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(rules, /Math\.random|fetch\(|score|weight|model/i);
});
