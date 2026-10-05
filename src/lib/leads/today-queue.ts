import type { Lead, LeadActivitySummary, LeadTimeline } from "./types.ts";
import { formatBudget, formatDuration, formatTimeline } from "./format.ts";
import {
  DEFAULT_QUEUE_LIMIT,
  HIGH_BUDGET_MIN,
  QUEUE_DORMANT_STATUSES,
  QUEUE_EXCLUDED_STATUSES,
  RECENT_ACTIVITY_HOURS,
  STALE_CONTACT_HOURS,
} from "./queue-config.ts";

/**
 * The Founder's "Today" queue: where to spend the next hour.
 *
 * Deterministic and explainable by construction — no scoring, no AI. Every
 * lead lands in AT MOST ONE bucket (the first that applies, in the fixed
 * priority order below), and every entry carries the human-readable reasons
 * that put it there. A lead matching no bucket is simply not listed: the
 * queue shows only what needs action now.
 *
 *   1. OVERDUE_FOLLOW_UP  a follow-up the founder set is due
 *   2. NEW_LEAD           status NEW (never worked)
 *   3. HIGH_VALUE         a high-budget lead not contacted recently
 *   4. STRONG_TIMELINE    a lead buying soon that has not been contacted recently
 *   5. RECENT_ACTIVITY    the buyer did something we have not yet responded to
 *
 * Within a bucket the order is the same fixed rule everywhere: higher budget
 * BAND first (high / known / unknown — judged per currency, so rupees and
 * dirhams are never compared directly), then nearer buying timeline, then
 * whoever has waited longest (or, for recent activity, whoever acted most
 * recently), then lead id so the order is stable. Pure functions only — `now` is always passed in.
 */

export type QueueBucket = "OVERDUE_FOLLOW_UP" | "NEW_LEAD" | "HIGH_VALUE" | "STRONG_TIMELINE" | "RECENT_ACTIVITY";

const BUCKET_RANK: Record<QueueBucket, number> = {
  OVERDUE_FOLLOW_UP: 1,
  NEW_LEAD: 2,
  HIGH_VALUE: 3,
  STRONG_TIMELINE: 4,
  RECENT_ACTIVITY: 5,
};

export interface TodayQueueInput {
  lead: Lead;
  /** The developer the buyer first researched, for the reason text. */
  developerName: string | null;
  summary: LeadActivitySummary | null;
}

export interface TodayQueueEntry {
  leadId: string;
  bucket: QueueBucket;
  bucketRank: number;
  /** One short reason per fact that put this lead here, in display order. */
  reasons: string[];
  /** The reasons joined for display: "₹2 Cr budget • Wants to buy within 30 days • No contact attempt in 18 hours". */
  summary: string;
}

type BudgetBand = 0 | 1 | 2; // 0 = high, 1 = known but not high, 2 = unknown

function budgetBand(lead: Lead): BudgetBand {
  if (!lead.budgetCurrency) return 2;
  const upper = lead.budgetMax ?? lead.budgetMin;
  if (upper === null) return 2;
  return upper >= HIGH_BUDGET_MIN[lead.budgetCurrency] ? 0 : 1;
}

const TIMELINE_RANK: Record<LeadTimeline, number> = {
  WITHIN_30_DAYS: 0,
  ONE_TO_THREE_MONTHS: 1,
  THREE_TO_SIX_MONTHS: 2,
  SIX_MONTHS_PLUS: 3,
  JUST_EXPLORING: 4,
};

function timelineRank(lead: Lead): number {
  return lead.timeline ? TIMELINE_RANK[lead.timeline] : 5;
}

const hours = (n: number) => n * 3_600_000;

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

interface Candidate {
  entry: TodayQueueEntry;
  band: BudgetBand;
  timeline: number;
  /** Ascending sort time within the bucket (older/more overdue first); recent activity uses the negated time so most recent sorts first. */
  time: number;
}

/** The "how long since we last touched this lead" reason, shared by several buckets. */
function contactReason(lead: Lead, summary: LeadActivitySummary | null, now: Date): string {
  const lastContact = summary?.lastContactAt ?? null;
  if (lastContact) return `last contacted ${formatDuration(now.getTime() - lastContact.getTime())} ago`;
  const age = formatDuration(now.getTime() - lead.createdAt.getTime());
  return `no contact attempt in ${age}`;
}

function isStale(summary: LeadActivitySummary | null, lead: Lead, now: Date): boolean {
  const reference = summary?.lastContactAt ?? null;
  if (!reference) return true; // never contacted
  return now.getTime() - reference.getTime() >= hours(STALE_CONTACT_HOURS);
}

function classify(input: TodayQueueInput, now: Date): Candidate | null {
  const { lead, summary, developerName } = input;
  if (lead.erasedAt) return null;
  if (QUEUE_EXCLUDED_STATUSES.includes(lead.status)) return null;

  const dormant = QUEUE_DORMANT_STATUSES.includes(lead.status);
  const budget = formatBudget(lead.budgetMin, lead.budgetMax, lead.budgetCurrency);
  const timeline = lead.timeline ? formatTimeline(lead.timeline) : null;
  const band = budgetBand(lead);
  const timelineOrder = timelineRank(lead);

  const make = (bucket: QueueBucket, parts: Array<string | null>, time: number): Candidate => {
    const reasons = parts.filter((part): part is string => Boolean(part));
    return {
      entry: {
        leadId: lead.id,
        bucket,
        bucketRank: BUCKET_RANK[bucket],
        reasons: reasons.map(capitalise),
        summary: reasons.map(capitalise).join(" • "),
      },
      band,
      timeline: timelineOrder,
      time,
    };
  };

  // 1. Overdue follow-up.
  if (lead.nextFollowUpAt && lead.nextFollowUpAt.getTime() <= now.getTime()) {
    const overdueBy = formatDuration(now.getTime() - lead.nextFollowUpAt.getTime());
    return make(
      "OVERDUE_FOLLOW_UP",
      [`follow-up overdue by ${overdueBy}`, budget, timeline, contactReason(lead, summary, now)],
      lead.nextFollowUpAt.getTime(),
    );
  }

  // 2. New lead (never worked). Dormant statuses are never NEW, so this is exact.
  if (lead.status === "NEW") {
    const source = developerName ? `new lead from ${developerName}` : "new lead";
    return make("NEW_LEAD", [source, budget, timeline, contactReason(lead, summary, now)], lead.createdAt.getTime());
  }

  // Parked leads are only ever surfaced by a due follow-up (above) or by the buyer coming back (below).
  if (!dormant) {
    const stale = isStale(summary, lead, now);

    // 3. High-value lead we haven't contacted recently.
    if (band === 0 && stale) {
      return make(
        "HIGH_VALUE",
        [budget, timeline, contactReason(lead, summary, now)],
        (summary?.lastContactAt ?? new Date(0)).getTime(),
      );
    }

    // 4. Buying soon and not contacted recently.
    if (timelineOrder <= 1 && stale) {
      return make(
        "STRONG_TIMELINE",
        [timeline, budget, contactReason(lead, summary, now)],
        (summary?.lastContactAt ?? new Date(0)).getTime(),
      );
    }
  }

  // 5. The buyer did something recently that we have not yet responded to.
  const buyerAt = summary?.lastBuyerActivityAt ?? null;
  if (buyerAt && now.getTime() - buyerAt.getTime() <= hours(RECENT_ACTIVITY_HOURS)) {
    const respondedAfter = summary?.lastContactAt && summary.lastContactAt.getTime() >= buyerAt.getTime();
    if (!respondedAfter && buyerAt.getTime() > lead.createdAt.getTime()) {
      const where = summary?.lastBuyerActivityDeveloperName
        ? `came back — clicked ${summary.lastBuyerActivityDeveloperName}'s website ${formatDuration(now.getTime() - buyerAt.getTime())} ago`
        : `came back ${formatDuration(now.getTime() - buyerAt.getTime())} ago`;
      return make("RECENT_ACTIVITY", [where, budget, timeline], -buyerAt.getTime());
    }
  }

  return null;
}

/**
 * Ranks `inputs` into the Today queue. Pure: the same inputs and `now` always
 * give the same list. Returns at most `limit` entries.
 */
export function buildTodayQueue(inputs: TodayQueueInput[], now: Date, limit: number = DEFAULT_QUEUE_LIMIT): TodayQueueEntry[] {
  const candidates = inputs.map((input) => classify(input, now)).filter((candidate): candidate is Candidate => candidate !== null);

  candidates.sort((a, b) => {
    if (a.entry.bucketRank !== b.entry.bucketRank) return a.entry.bucketRank - b.entry.bucketRank;
    if (a.band !== b.band) return a.band - b.band;
    if (a.timeline !== b.timeline) return a.timeline - b.timeline;
    if (a.time !== b.time) return a.time - b.time;
    return a.entry.leadId < b.entry.leadId ? -1 : a.entry.leadId > b.entry.leadId ? 1 : 0;
  });

  return candidates.slice(0, Math.max(0, limit)).map((candidate) => candidate.entry);
}
