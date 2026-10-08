import { UnauthorizedLeadActionError } from "./errors.ts";
import type { LeadRepositories, SourceFunnelRow, SourceRevenueRow } from "./repository.ts";
import type { LeadActor, LeadCurrency, LeadSourceType } from "./types.ts";

/**
 * Cold Call vs Digital, derived from the records and nothing else. A cohort is "leads CREATED in the range"; each stage counts
 * the distinct leads that EVER reached it, so the stages only shrink and a lead is never counted twice.
 *
 * A rate is shown only when its denominator is large enough to mean something. Below MIN_SAMPLE leads the number is still shown
 * as a count, but no percentage is printed: 1 of 2 is not "50%".
 */

export const MIN_SAMPLE = 10;

export const FUNNEL_STAGES = ["leads", "called", "connected", "qualified", "shortlisted", "visitsScheduled", "visitsDone", "negotiation", "booked"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const STAGE_LABEL: Record<FunnelStage, string> = {
  leads: "Leads",
  called: "Called",
  connected: "Connected",
  qualified: "Qualified",
  shortlisted: "Shortlisted",
  visitsScheduled: "Visits scheduled",
  visitsDone: "Visits done",
  negotiation: "Negotiation",
  booked: "Booked",
};

/** Percentage of `part` in `whole`, or null when the sample is too small to mean anything. */
export function rate(part: number, whole: number): number | null {
  if (whole < MIN_SAMPLE) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export interface FunnelSummary {
  sourceType: LeadSourceType;
  counts: Record<FunnelStage, number>;
  talkSeconds: number;
  /** Stage -> share of the leads that reached it, or null for a small sample. */
  rates: Record<FunnelStage, number | null>;
  /** Per finer source (INSTAGRAM, REFERRAL, ...). */
  details: Array<{ detail: string; counts: Record<FunnelStage, number> }>;
  revenue: Array<{ currency: LeadCurrency; bookingValue: number; commissionExpected: number; commissionReceived: number }>;
}

export interface PersonSummary {
  personId: string;
  sourceType: LeadSourceType;
  counts: Record<FunnelStage, number>;
  talkSeconds: number;
  revenue: Array<{ currency: LeadCurrency; bookingValue: number; commissionReceived: number }>;
}

const zero = (): Record<FunnelStage, number> => Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>;
const add = (into: Record<FunnelStage, number>, row: SourceFunnelRow) => {
  for (const s of FUNNEL_STAGES) into[s] += row[s];
};

function requireFounder(actor: LeadActor) {
  if (actor.actorType !== "FOUNDER") throw new UnauthorizedLeadActionError("Only the Founder can see source analytics.");
}

export function summariseBySource(rows: SourceFunnelRow[], revenue: SourceRevenueRow[]): FunnelSummary[] {
  return (["COLD_CALL", "DIGITAL"] as const).map((sourceType) => {
    const counts = zero();
    let talkSeconds = 0;
    const details: FunnelSummary["details"] = [];
    for (const row of rows.filter((r) => r.sourceType === sourceType)) {
      add(counts, row);
      talkSeconds += row.talkSeconds;
      const detailCounts = zero();
      add(detailCounts, row);
      details.push({ detail: row.sourceDetail ?? "UNSPECIFIED", counts: detailCounts });
    }
    const rates = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, s === "leads" ? null : rate(counts[s], counts.leads)])) as FunnelSummary["rates"];
    return {
      sourceType,
      counts,
      talkSeconds,
      rates,
      details,
      revenue: revenue.filter((r) => r.sourceType === sourceType).map(({ currency, bookingValue, commissionExpected, commissionReceived }) => ({ currency, bookingValue, commissionExpected, commissionReceived })),
    };
  });
}

export async function getSourceFunnel(repos: LeadRepositories, actor: LeadActor, range: { from: Date; to: Date }, sourceType?: LeadSourceType): Promise<FunnelSummary[]> {
  requireFounder(actor);
  const { rows, revenue } = await repos.leads.sourceFunnel({ ...range, groupBy: "SOURCE", sourceType });
  const all = summariseBySource(rows, revenue);
  return sourceType ? all.filter((s) => s.sourceType === sourceType) : all;
}

/** Per person: cold-call leads credit whoever generated them, digital leads the person they are assigned to. Never merged into one score. */
export async function getPersonFunnel(repos: LeadRepositories, actor: LeadActor, range: { from: Date; to: Date }, sourceType?: LeadSourceType): Promise<PersonSummary[]> {
  requireFounder(actor);
  const { rows, revenue } = await repos.leads.sourceFunnel({ ...range, groupBy: "OWNER", sourceType });
  return rows
    .filter((r) => r.personId)
    .map((row) => {
      const counts = zero();
      add(counts, row);
      return {
        personId: row.personId!,
        sourceType: row.sourceType,
        counts,
        talkSeconds: row.talkSeconds,
        revenue: revenue.filter((r) => r.personId === row.personId && r.sourceType === row.sourceType).map(({ currency, bookingValue, commissionReceived }) => ({ currency, bookingValue, commissionReceived })),
      };
    });
}
