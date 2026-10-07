import type { AcquisitionRow } from "./acquisition.ts";
import { channelOf, CHANNEL_LABEL, type AcquisitionChannel } from "./acquisition.ts";

/**
 * DECISION SUPPORT AND STATISTICS - pure, deterministic, honest about what it is.
 *
 * WHAT THIS IS NOT. None of the "next step" logic is AI or machine learning: it is a short list of plain rules, shown as
 * such, each with the facts that triggered it. Statistics (rates with confidence intervals, forecasts from history) are
 * statistics, and they refuse to produce a number when there is too little data. A trained model exists only as a gated,
 * tested capability (logistic.ts) that is NOT run until the readiness thresholds below are met - and it is not met today.
 *
 * Nothing here can see or change who may view what: the inputs are already authorized by the caller, and the outputs
 * contain ids, counts and rule names - never a name, phone number or note.
 */

// --- thresholds (named, so they can be read and argued with) ----------------------------------------

export const SUFFICIENCY = {
  /** Fewest leads before a channel's conversion rate is shown as an estimate at all. */
  MIN_LEADS_FOR_RATE: 30,
  /** Fewest leads that reached a stage before a stage-to-booking rate is used for forecasting. */
  MIN_STAGE_SAMPLE: 30,
  /** Fewest bookings overall before any forecast is shown. */
  MIN_BOOKINGS_FOR_FORECAST: 10,
  /** Fewest bookings in a currency before an average commission per booking is used. */
  MIN_BOOKINGS_FOR_AVERAGE_COMMISSION: 10,
  /** To train ANY lead-conversion model: labelled leads (leads old enough that their outcome is settled) and bookings among them. */
  MODEL_MIN_LABELLED_LEADS: 500,
  MODEL_MIN_POSITIVES: 50,
} as const;

// --- statistics --------------------------------------------------------------------------------------

export interface RateEstimate {
  successes: number;
  n: number;
  /** null when there is too little data to say anything. */
  rate: number | null;
  /** 95% Wilson score interval; null with the rate. */
  low: number | null;
  high: number | null;
  status: "ESTIMATE" | "INSUFFICIENT_DATA";
}

/** The 95% Wilson score interval for a proportion - sound for small samples, unlike the plain normal approximation. */
export function wilsonInterval(successes: number, n: number): { low: number; high: number } | null {
  if (n <= 0 || successes < 0 || successes > n) return null;
  const z = 1.959963984540054;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

export function rateEstimate(successes: number, n: number, minN: number = SUFFICIENCY.MIN_LEADS_FOR_RATE): RateEstimate {
  const ci = n >= minN ? wilsonInterval(successes, n) : null;
  if (!ci) return { successes, n, rate: null, low: null, high: null, status: "INSUFFICIENT_DATA" };
  return { successes, n, rate: successes / n, low: ci.low, high: ci.high, status: "ESTIMATE" };
}

export interface ChannelQuality {
  channel: AcquisitionChannel;
  label: string;
  qualified: RateEstimate;
  booked: RateEstimate;
}

/** Per channel, how often leads qualified and booked - with the uncertainty, and nothing at all when the sample is small. */
export function channelQuality(rows: readonly AcquisitionRow[]): ChannelQuality[] {
  const by = new Map<AcquisitionChannel, AcquisitionRow[]>();
  for (const r of rows) {
    const c = channelOf(r, "first");
    by.set(c, [...(by.get(c) ?? []), r]);
  }
  return [...by.entries()]
    .map(([channel, list]) => ({ channel, label: CHANNEL_LABEL[channel], qualified: rateEstimate(list.filter((r) => r.reachedQualified).length, list.length), booked: rateEstimate(list.filter((r) => r.booked).length, list.length) }))
    .sort((a, b) => b.qualified.n - a.qualified.n);
}

// --- forecast -----------------------------------------------------------------------------------------

export interface ForecastInput {
  /** Live pipeline stages with how many leads are there now. */
  open: Array<{ stage: string; count: number }>;
  /** For each stage: leads that EVER reached it, and how many of those went on to book. From history, not from today's status. */
  history: Array<{ stage: string; reached: number; booked: number }>;
  totalBookings: number;
  /** Average commission received per booking by currency, with how many bookings it rests on. */
  averageCommission: Partial<Record<"INR" | "AED", { average: number; bookings: number }>>;
}

export interface Forecast {
  status: "ESTIMATE" | "INSUFFICIENT_DATA";
  /** Why there is no number, when there is none. */
  reasons: string[];
  expectedBookings: number | null;
  /** Expected commission per currency (bookings x average commission), only for currencies with enough history. */
  expectedCommission: Partial<Record<"INR" | "AED", number>>;
  /** Per stage: the historical rate used and what it rests on. */
  stages: Array<{ stage: string; open: number; rate: RateEstimate }>;
}

/**
 * Expected bookings from today's open pipeline, using how often leads that reached each stage booked in the past. It is an
 * expectation, not a promise: it applies only when there is enough history, and every stage it uses shows its sample size.
 */
export function forecast(input: ForecastInput): Forecast {
  const reasons: string[] = [];
  if (input.totalBookings < SUFFICIENCY.MIN_BOOKINGS_FOR_FORECAST) reasons.push(`Only ${input.totalBookings} booking${input.totalBookings === 1 ? "" : "s"} so far; at least ${SUFFICIENCY.MIN_BOOKINGS_FOR_FORECAST} are needed before a forecast means anything.`);
  const stages = input.open.map((o) => {
    const h = input.history.find((x) => x.stage === o.stage);
    return { stage: o.stage, open: o.count, rate: rateEstimate(h?.booked ?? 0, h?.reached ?? 0, SUFFICIENCY.MIN_STAGE_SAMPLE) };
  });
  const used = stages.filter((s) => s.open > 0);
  const missing = used.filter((s) => s.rate.status !== "ESTIMATE");
  if (used.length > 0 && missing.length > 0) reasons.push(`Not enough history for ${missing.map((s) => s.stage.toLowerCase().replace(/_/g, " ")).join(", ")} (each needs at least ${SUFFICIENCY.MIN_STAGE_SAMPLE} past leads).`);
  if (used.length === 0) reasons.push("There are no open leads in the pipeline stages the forecast covers.");
  if (reasons.length > 0) return { status: "INSUFFICIENT_DATA", reasons, expectedBookings: null, expectedCommission: {}, stages };
  const expectedBookings = used.reduce((n, s) => n + s.open * (s.rate.rate ?? 0), 0);
  const expectedCommission: Forecast["expectedCommission"] = {};
  for (const currency of ["INR", "AED"] as const) {
    const avg = input.averageCommission[currency];
    if (avg && avg.bookings >= SUFFICIENCY.MIN_BOOKINGS_FOR_AVERAGE_COMMISSION) expectedCommission[currency] = Math.round(expectedBookings * avg.average);
  }
  return { status: "ESTIMATE", reasons: [], expectedBookings, expectedCommission, stages };
}

// --- model readiness ----------------------------------------------------------------------------------

export interface ModelReadiness {
  ready: boolean;
  labelledLeads: number;
  positives: number;
  needs: string[];
}

/** Whether there is enough settled history to even attempt a conversion model. Today this is the gate, and it is closed until the data exists. */
export function modelReadiness(labelledLeads: number, positives: number): ModelReadiness {
  const needs: string[] = [];
  if (labelledLeads < SUFFICIENCY.MODEL_MIN_LABELLED_LEADS) needs.push(`${SUFFICIENCY.MODEL_MIN_LABELLED_LEADS - labelledLeads} more leads with a settled outcome`);
  if (positives < SUFFICIENCY.MODEL_MIN_POSITIVES) needs.push(`${SUFFICIENCY.MODEL_MIN_POSITIVES - positives} more bookings`);
  return { ready: needs.length === 0, labelledLeads, positives, needs };
}

// --- next best step (rules, not AI) ---------------------------------------------------------------------

export interface LeadActionContext {
  status: string;
  ownerAssigned: boolean;
  contactAttempts: number;
  lastActivityDaysAgo: number;
  followUp: { state: "NONE" | "UPCOMING" | "DUE_SOON" | "OVERDUE" } ;
  visitAwaitingOutcome: boolean;
  openVisit: boolean;
  lastCall: { classification: "DIALED" | "CONNECTED" | null; disposition: string | null } | null;
  hasRequirement: boolean;
  matchingProjects: number;
  shortlisted: number;
}

export interface NextStep {
  /** Which rule fired - shown to the person, so the logic is never hidden. */
  rule: string;
  action: string;
  /** The facts behind it. */
  reasons: string[];
}

const STAGES_FROM_QUALIFIED = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"];
const OPEN_STATUSES_EXCLUDED = ["BOOKED", "CLOSED", "LOST", "NOT_INTERESTED", "UNQUALIFIED", "WRONG_NUMBER", "DUPLICATE"];

/** The first rule that applies wins; the order is the priority. Pure and deterministic. */
export function nextStep(c: LeadActionContext): NextStep {
  if (OPEN_STATUSES_EXCLUDED.includes(c.status)) return { rule: "CLOSED_OUT", action: "Nothing to do: this lead is closed out.", reasons: [`Status is ${c.status.toLowerCase().replace(/_/g, " ")}.`] };
  if (c.followUp.state === "OVERDUE") return { rule: "FOLLOW_UP_OVERDUE", action: "Resolve the missed follow-up first", reasons: ["A follow-up time passed with nothing done.", "Missed follow-ups block work on other leads."] };
  if (c.visitAwaitingOutcome) return { rule: "VISIT_AWAITING_OUTCOME", action: "Record how the site visit went", reasons: ["The visit time has passed and no outcome is recorded."] };
  if (c.followUp.state === "DUE_SOON") return { rule: "FOLLOW_UP_DUE", action: "Do the follow-up now", reasons: ["A follow-up is due within minutes."] };
  if (c.lastCall && (c.lastCall.disposition === "CALLBACK_REQUESTED" || c.lastCall.disposition === "FOLLOW_UP_REQUIRED") && c.followUp.state === "NONE") {
    return { rule: "PROMISED_FOLLOW_UP", action: "Schedule the follow-up the buyer asked for", reasons: [`The last call ended with "${c.lastCall.disposition.toLowerCase().replace(/_/g, " ")}".`, "No follow-up is scheduled."] };
  }
  if (c.status === "NEW" && c.contactAttempts === 0) return { rule: "FIRST_CONTACT", action: "Make the first call", reasons: ["The lead is new and has not been contacted."].concat(c.ownerAssigned ? [] : ["It has no owner yet."]) };
  if (c.hasRequirement && c.shortlisted === 0 && c.matchingProjects > 0 && ["CONTACTED", "QUALIFIED", "NEW"].includes(c.status)) {
    return { rule: "SHORTLIST_MATCHES", action: "Shortlist the matching projects", reasons: [`${c.matchingProjects} project${c.matchingProjects === 1 ? "" : "s"} match the buyer's requirement on every stated point.`, "Nothing is shortlisted yet."] };
  }
  if (c.shortlisted > 0 && !c.openVisit && STAGES_FROM_QUALIFIED.includes(c.status) && c.status !== "SITE_VISIT_DONE" && c.status !== "NEGOTIATION") {
    return { rule: "OFFER_SITE_VISIT", action: "Offer a site visit", reasons: [`${c.shortlisted} project${c.shortlisted === 1 ? "" : "s"} shortlisted.`, "No site visit is scheduled."] };
  }
  if (c.lastActivityDaysAgo >= 3 && c.followUp.state === "NONE") return { rule: "RECONNECT", action: "Reconnect and schedule a follow-up", reasons: [`No activity for ${c.lastActivityDaysAgo} days.`, "No follow-up is scheduled."] };
  return { rule: "NO_ACTION", action: "No action needed right now", reasons: ["Nothing is overdue, due soon or waiting on you."] };
}
