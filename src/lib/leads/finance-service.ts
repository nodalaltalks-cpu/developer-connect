import { LeadNotFoundError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { ACQUISITION_CHANNELS, type AttributionBasis } from "./acquisition.ts";
import { MAX_REPORT_LEADS } from "./campaign-service.ts";
import { buildFinanceReport, CURRENCIES, type FinanceReport } from "./finance.ts";
import type { LeadRepositories } from "./repository.ts";
import { BUSINESS_TIME_ZONE } from "./format.ts";
import { LEAD_CURRENCIES, type Booking, type LeadActor, type LeadCurrency, type MarketingSpend } from "./types.ts";

/**
 * Marketing spend and the finance report. Framework-free; Founder only. Spend entries are financial records: recorded
 * once, never edited or deleted, corrected by VOIDING (with a reason) and re-entering. Currencies are never mixed.
 */

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_NOTE = 200;

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required for finance.");
}

/** A calendar date (YYYY-MM-DD) in the business time zone. */
export function businessDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export interface SpendInput {
  channel: string;
  campaignId?: string | null;
  spentOn: string;
  currency: LeadCurrency;
  amount: number;
  note?: string | null;
}

export async function recordSpend(repos: LeadRepositories, input: SpendInput, actor: LeadActor, now: Date = new Date()): Promise<MarketingSpend> {
  assertFounder(actor);
  if (!(ACQUISITION_CHANNELS as readonly string[]).includes(input.channel)) throw new LeadValidationError("channel", "Choose a channel from the list.");
  if (!(LEAD_CURRENCIES as readonly string[]).includes(input.currency)) throw new LeadValidationError("currency", "Choose INR or AED.");
  if (typeof input.amount !== "number" || !Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) throw new LeadValidationError("amount", "Enter the amount as a whole number greater than zero.");
  if (typeof input.spentOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn) || Number.isNaN(new Date(`${input.spentOn}T00:00:00Z`).getTime())) throw new LeadValidationError("date", "Choose the date the money was spent.");
  if (input.spentOn > businessDate(now)) throw new LeadValidationError("date", "Spend cannot be dated in the future.");
  if (input.spentOn < "2020-01-01") throw new LeadValidationError("date", "That date is too far in the past.");
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  if (note && note.length > MAX_NOTE) throw new LeadValidationError("note", `The note is too long (max ${MAX_NOTE} characters).`);
  let campaignId: string | null = null;
  if (input.campaignId) {
    const campaign = await repos.campaigns.getById(input.campaignId);
    if (!campaign) throw new LeadValidationError("campaign", "Choose a campaign from the list.");
    campaignId = campaign.id;
  }
  return repos.spend.create({ channel: input.channel, campaignId, spentOn: input.spentOn, currency: input.currency, amount: input.amount, note, createdBy: actor.actorId, now });
}

export async function voidSpend(repos: LeadRepositories, spendId: string, reason: string, actor: LeadActor, now: Date = new Date()): Promise<MarketingSpend> {
  assertFounder(actor);
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new LeadValidationError("reason", "Say why this entry is being voided.");
  if (why.length > MAX_NOTE) throw new LeadValidationError("reason", `The reason is too long (max ${MAX_NOTE} characters).`);
  const existing = typeof spendId === "string" ? await repos.spend.getById(spendId) : null;
  if (!existing) throw new LeadNotFoundError("Spend entry not found.");
  return repos.spend.void(spendId, actor.actorId, why, now);
}

export async function listSpend(repos: LeadRepositories, actor: LeadActor, range: { from: Date; to: Date }, limit = 200): Promise<MarketingSpend[]> {
  assertFounder(actor);
  return repos.spend.list({ fromDate: businessDate(range.from), toDate: businessDate(new Date(range.to.getTime() - 1)), limit });
}

export interface OutstandingCommission {
  booking: Booking;
  outstanding: number;
}

export interface FinanceView {
  report: FinanceReport;
  outstanding: OutstandingCommission[];
  /** Per currency: what is still owed across ALL live bookings (not only the range). */
  outstandingTotals: Partial<Record<LeadCurrency, number>>;
}

/** The Founder's finance report for leads CREATED in the range and spend DATED in it. Read-only. */
export async function getFinanceView(repos: LeadRepositories, actor: LeadActor, range: { from: Date; to: Date }, basis: AttributionBasis = "first"): Promise<FinanceView> {
  assertFounder(actor);
  if (basis !== "first" && basis !== "latest") throw new LeadValidationError("basis", "Choose first touch or latest touch.");
  const [rows, spend, campaigns, projects, outstanding] = await Promise.all([
    repos.leads.acquisitionRows({ from: range.from, to: range.to, limit: MAX_REPORT_LEADS + 1 }),
    listSpend(repos, actor, range, 5000),
    repos.campaigns.list(500),
    repos.projects.list({ activeOnly: false, limit: 500 }),
    repos.bookings.listOutstanding(200),
  ]);
  const truncated = rows.length > MAX_REPORT_LEADS;
  const report = buildFinanceReport(truncated ? rows.slice(0, MAX_REPORT_LEADS) : rows, spend, campaigns.map((c) => ({ id: c.id, name: c.name, utmCampaign: c.utmCampaign })), new Map(projects.map((p) => [p.id, p.name])), basis, truncated);
  const items = outstanding.map((booking) => ({ booking, outstanding: booking.commissionExpected - booking.commissionReceived }));
  const outstandingTotals: Partial<Record<LeadCurrency, number>> = {};
  for (const currency of CURRENCIES) {
    const total = items.filter((i) => i.booking.currency === currency).reduce((n, i) => n + i.outstanding, 0);
    if (total > 0) outstandingTotals[currency] = total;
  }
  return { report, outstanding: items, outstandingTotals };
}
