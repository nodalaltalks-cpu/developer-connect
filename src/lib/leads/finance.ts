import { campaignKeyOf, channelOf, CHANNEL_LABEL, NO_CAMPAIGN, type AcquisitionChannel, type AcquisitionRow, type AttributionBasis, type CampaignDef } from "./acquisition.ts";
import type { LeadCurrency, MarketingSpend } from "./types.ts";

/**
 * MARKETING + FINANCE ARITHMETIC - pure, framework-free. Combines the acquisition rows (what leads became) with the
 * recorded spend (what was paid) into the unit economics the Founder decides on.
 *
 * RULES THAT KEEP IT HONEST
 *  - Currencies are NEVER mixed or converted. Spend and revenue are kept per currency (INR, AED) and every ratio is
 *    computed inside one currency. There is no exchange-rate policy, so nothing here assumes one.
 *  - Revenue is COMMISSION: "received" is cash in, "expected" is the pipeline, "outstanding" = expected - received on
 *    live (BOOKED) bookings. Booking value is the buyer's purchase price and is shown, but is not Developer Connects'
 *    revenue.
 *  - A ratio whose denominator is zero is null (shown as a dash), never a made-up 0.
 *  - Voided spend counts for nothing. Spend with no leads still shows (a channel that costs money and brings nobody is
 *    exactly what the Founder needs to see).
 *  - Leads are grouped by when they were CREATED; spend by the day it was spent; commission is whatever has been
 *    recorded against those leads' bookings so far. The cohorts differ in time, and the report says so.
 */

export const CURRENCIES: readonly LeadCurrency[] = ["INR", "AED"];

export interface FinanceCounts {
  leads: number;
  qualified: number;
  siteVisits: number;
  bookings: number;
}

export interface MoneyMetrics {
  spend: number;
  /** Buyers' booking values (for context; not revenue). */
  bookingValue: number;
  commissionExpected: number;
  commissionReceived: number;
  outstanding: number;
  /** Bookings in this currency. */
  bookings: number;
  /** Cash in minus spend. */
  profit: number;
  /** spend / leads */
  cpl: number | null;
  /** spend / qualified leads */
  cpql: number | null;
  costPerSiteVisit: number | null;
  /** Spend per booking (the cost of acquiring a booked buyer). */
  costPerBooking: number | null;
  /** commission received / spend */
  roas: number | null;
  /** (commission received - spend) / spend */
  roi: number | null;
  revenuePerLead: number | null;
  revenuePerQualified: number | null;
  revenuePerSiteVisit: number | null;
  revenuePerBooking: number | null;
}

export interface FinanceGroup {
  key: string;
  label: string;
  counts: FinanceCounts;
  money: Partial<Record<LeadCurrency, MoneyMetrics>>;
}

export interface FinanceReport {
  basis: AttributionBasis;
  byChannel: FinanceGroup[];
  byCampaign: FinanceGroup[];
  byProject: FinanceGroup[];
  totals: FinanceGroup;
  /** True when the lead cap was hit (the report covers the most recent leads only). */
  truncated: boolean;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function moneyMetrics(counts: FinanceCounts, m: { spend: number; bookingValue: number; commissionExpected: number; commissionReceived: number; bookings: number }): MoneyMetrics {
  const received = m.commissionReceived;
  return {
    spend: m.spend,
    bookingValue: m.bookingValue,
    commissionExpected: m.commissionExpected,
    commissionReceived: received,
    outstanding: Math.max(0, m.commissionExpected - received),
    bookings: m.bookings,
    profit: received - m.spend,
    cpl: div(m.spend, counts.leads),
    cpql: div(m.spend, counts.qualified),
    costPerSiteVisit: div(m.spend, counts.siteVisits),
    costPerBooking: div(m.spend, m.bookings),
    roas: div(received, m.spend),
    roi: m.spend > 0 ? (received - m.spend) / m.spend : null,
    revenuePerLead: div(received, counts.leads),
    revenuePerQualified: div(received, counts.qualified),
    revenuePerSiteVisit: div(received, counts.siteVisits),
    revenuePerBooking: div(received, m.bookings),
  };
}

interface Acc {
  counts: FinanceCounts;
  money: Map<LeadCurrency, { spend: number; bookingValue: number; commissionExpected: number; commissionReceived: number; bookings: number }>;
}

const newAcc = (): Acc => ({ counts: { leads: 0, qualified: 0, siteVisits: 0, bookings: 0 }, money: new Map() });
const cell = (acc: Acc, currency: LeadCurrency) => {
  let c = acc.money.get(currency);
  if (!c) acc.money.set(currency, (c = { spend: 0, bookingValue: 0, commissionExpected: 0, commissionReceived: 0, bookings: 0 }));
  return c;
};

function finish(map: Map<string, Acc>, labelOf: (key: string) => string): FinanceGroup[] {
  return [...map.entries()]
    .map(([key, acc]) => ({
      key,
      label: labelOf(key),
      counts: acc.counts,
      money: Object.fromEntries(CURRENCIES.filter((c) => acc.money.has(c)).map((c) => [c, moneyMetrics(acc.counts, acc.money.get(c)!)])) as Partial<Record<LeadCurrency, MoneyMetrics>>,
    }))
    .sort((a, b) => b.counts.leads - a.counts.leads || a.label.localeCompare(b.label));
}

function addLead(acc: Acc, row: AcquisitionRow) {
  acc.counts.leads += 1;
  if (row.reachedQualified) acc.counts.qualified += 1;
  if (row.hasSiteVisit) acc.counts.siteVisits += 1;
  if (row.booked) acc.counts.bookings += 1;
  for (const b of row.bookings) {
    const c = cell(acc, b.currency);
    c.bookingValue += b.bookingValue;
    c.commissionExpected += b.commissionExpected;
    c.commissionReceived += b.commissionReceived;
    c.bookings += 1;
  }
}

/** Builds the whole finance report. `spend` must already be limited to the range; voided entries are ignored here. */
export function buildFinanceReport(
  rows: readonly AcquisitionRow[],
  spend: readonly MarketingSpend[],
  campaigns: readonly CampaignDef[],
  projectNames: ReadonlyMap<string, string>,
  basis: AttributionBasis,
  truncated = false,
): FinanceReport {
  const byTag = new Map(campaigns.map((c) => [c.utmCampaign.trim().toLowerCase(), c]));
  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));
  const channels = new Map<string, Acc>();
  const camps = new Map<string, Acc>();
  const projectsAcc = new Map<string, Acc>();
  const typedProjectNames = new Map<string, string>();
  const totals = newAcc();
  const get = (map: Map<string, Acc>, key: string) => map.get(key) ?? map.set(key, newAcc()).get(key)!;

  for (const row of rows) {
    addLead(get(channels, channelOf(row, basis)), row);
    addLead(get(camps, campaignKeyOf(row, byTag, basis)), row);
    addLead(totals, row);
    for (const b of row.bookings) {
      // Project profitability counts bookings, not leads: a lead's bookings are attributed to the project each was for.
      const key = b.projectId ?? (b.projectName ? `name:${b.projectName.trim().toLowerCase()}` : "unlinked");
      if (b.projectName && !b.projectId && !typedProjectNames.has(key)) typedProjectNames.set(key, b.projectName.trim());
      const acc = get(projectsAcc, key);
      const c = cell(acc, b.currency);
      c.bookingValue += b.bookingValue;
      c.commissionExpected += b.commissionExpected;
      c.commissionReceived += b.commissionReceived;
      c.bookings += 1;
      acc.counts.bookings += 1;
    }
  }

  for (const s of spend) {
    if (s.voidedAt !== null) continue;
    cell(get(channels, s.channel), s.currency).spend += s.amount;
    if (s.campaignId) cell(get(camps, s.campaignId), s.currency).spend += s.amount;
    cell(totals, s.currency).spend += s.amount;
  }

  const labelCampaign = (k: string) => (k === NO_CAMPAIGN ? "No campaign tag" : k.startsWith("tag:") ? `Untracked tag: ${k.slice(4)}` : (campaignNames.get(k) ?? "Campaign"));
  const labelProject = (k: string) => (k === "unlinked" ? "Not linked to a recorded project" : k.startsWith("name:") ? (typedProjectNames.get(k) ?? k.slice(5)) : (projectNames.get(k) ?? "Project"));
  const [total] = finish(new Map([["all", totals]]), () => "All leads");
  return {
    basis,
    byChannel: finish(channels, (k) => CHANNEL_LABEL[k as AcquisitionChannel] ?? k),
    byCampaign: finish(camps, labelCampaign).slice(0, 50),
    byProject: finish(projectsAcc, labelProject).slice(0, 50),
    totals: total,
    truncated,
  };
}

export function formatRatio(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}
