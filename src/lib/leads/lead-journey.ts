import type { LeadRepositories } from "./repository.ts";
import type { Lead, LeadEvent } from "./types.ts";

/**
 * Where one lead is on the road to revenue, derived from the records and nothing else. Each stage is DONE (with the date it was
 * first reached), CURRENT (the next one to work on) or AHEAD. Nothing is estimated and no stage is ever marked done by hand.
 *
 *   Lead         the record exists
 *   Requirement  a structured requirement was recorded
 *   Matching     at least one project was picked for the buyer (shortlist rows exist, even if later removed)
 *   Shortlist    the pipeline reached SHORTLISTED or beyond
 *   Site visit   a visit was scheduled (and not only cancelled)
 *   Negotiation  the pipeline reached NEGOTIATION or beyond
 *   Booking      a booking exists that was not cancelled
 *   Revenue      commission has actually been received
 */

export const JOURNEY_STAGES = ["LEAD", "REQUIREMENT", "MATCHING", "SHORTLIST", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REVENUE"] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];
export const JOURNEY_LABEL: Record<JourneyStage, string> = { LEAD: "Lead", REQUIREMENT: "Requirement", MATCHING: "Matching", SHORTLIST: "Shortlist", SITE_VISIT: "Site visit", NEGOTIATION: "Negotiation", BOOKING: "Booking", REVENUE: "Revenue" };

export interface JourneyStep {
  stage: JourneyStage;
  /** SKIPPED: a later stage happened but nothing was recorded for this one (for example a booking with no logged site visit). */
  state: "DONE" | "CURRENT" | "AHEAD" | "SKIPPED";
  /** When the stage was first reached, or null when it has not been. */
  at: Date | null;
}

export interface JourneyInput {
  lead: Pick<Lead, "createdAt" | "status">;
  events: Array<Pick<LeadEvent, "toStatus" | "createdAt">>;
  requirementAts: Date[];
  shortlistAts: Date[];
  /** Non-cancelled visits only. */
  visitAts: Date[];
  /** Non-cancelled bookings. */
  bookingAts: Date[];
  commissionReceivedAts: Date[];
}

const earliest = (dates: Date[]) => (dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime()))));
const SHORTLIST_ON = ["SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];
const NEGOTIATION_ON = ["NEGOTIATION", "BOOKED", "CLOSED"];

function firstReached(input: JourneyInput, statuses: string[]): Date | null {
  const fromEvents = earliest(input.events.filter((e) => e.toStatus && statuses.includes(e.toStatus)).map((e) => e.createdAt));
  // A lead created already past the stage has no event for it: its own creation time is then the honest date.
  return fromEvents ?? (statuses.includes(input.lead.status) ? input.lead.createdAt : null);
}

export function buildJourney(input: JourneyInput): JourneyStep[] {
  const at: Record<JourneyStage, Date | null> = {
    LEAD: input.lead.createdAt,
    REQUIREMENT: earliest(input.requirementAts),
    MATCHING: earliest(input.shortlistAts),
    SHORTLIST: firstReached(input, SHORTLIST_ON),
    SITE_VISIT: earliest(input.visitAts),
    NEGOTIATION: firstReached(input, NEGOTIATION_ON),
    BOOKING: earliest(input.bookingAts),
    REVENUE: earliest(input.commissionReceivedAts),
  };
  const furthest = Math.max(...JOURNEY_STAGES.map((stage, i) => (at[stage] ? i : -1)));
  return JOURNEY_STAGES.map((stage, i) => {
    if (at[stage]) return { stage, state: "DONE" as const, at: at[stage] };
    if (i < furthest) return { stage, state: "SKIPPED" as const, at: null };
    return { stage, state: i === furthest + 1 ? ("CURRENT" as const) : ("AHEAD" as const), at: null };
  });
}

/** Loads exactly what the tracker needs. The caller has already authorised access to this lead. */
export async function getLeadJourney(repos: LeadRepositories, lead: Pick<Lead, "id" | "createdAt" | "status">): Promise<JourneyStep[]> {
  const [events, requirements, shortlist, visits, bookings] = await Promise.all([
    repos.events.listByLead(lead.id),
    repos.requirements.listByLead(lead.id),
    repos.shortlist.listByLead(lead.id),
    repos.siteVisits.listByLead(lead.id),
    repos.bookings.listByLead(lead.id),
  ]);
  const live = bookings.filter((b) => b.status === "BOOKED");
  return buildJourney({
    lead,
    events,
    requirementAts: requirements.map((r) => r.createdAt),
    shortlistAts: shortlist.map((s) => s.shortlistedAt),
    visitAts: visits.filter((v) => v.status !== "CANCELLED").map((v) => v.createdAt),
    bookingAts: live.map((b) => b.bookedAt),
    commissionReceivedAts: live.filter((b) => b.commissionReceived > 0 && b.commissionReceivedAt).map((b) => b.commissionReceivedAt!),
  });
}
