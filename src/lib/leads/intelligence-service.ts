import { LeadNotFoundError, UnauthorizedLeadActionError } from "./errors.ts";
import { assertWorkingActor, canViewLead } from "./lead-access.ts";
import { channelQuality, forecast, modelReadiness, nextStep, SUFFICIENCY, type ChannelQuality, type Forecast, type LeadActionContext, type ModelReadiness, type NextStep } from "./intelligence.ts";
import { matchRequirementToProject } from "./project-matching.ts";
import type { LeadRepositories } from "./repository.ts";
import { getTodayQueue } from "./lead-service.ts";
import { DUE_SOON_MINUTES } from "./follow-up-service.ts";
import type { Lead, LeadActor, LeadStatus } from "./types.ts";

/**
 * Reads for decision support and statistics. Authorization is the caller's actor and the same ownership rule as every
 * other lead read: a team member gets a next step only for a lead they own; the Founder-wide report is Founder only.
 * Outputs carry ids, counts and rule names, never a note, phone number or name.
 */

const DAY = 86_400_000;

export interface LeadNextStep {
  leadId: string;
  step: NextStep;
}

/** What the rules need to know about one lead, read through the repositories. */
export async function getLeadActionContext(repos: LeadRepositories, lead: Lead, now: Date): Promise<LeadActionContext> {
  const [open, calls, events, requirement, visits, shortlist] = await Promise.all([
    repos.followUps.getOpenByLead(lead.id),
    repos.calls.listByLead(lead.id),
    repos.events.listByLead(lead.id),
    repos.requirements.getActiveByLead(lead.id),
    repos.siteVisits.listByLead(lead.id),
    repos.shortlist.listByLead(lead.id),
  ]);
  const classified = calls.filter((c) => c.classification !== null).sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
  const attempts = events.filter((e) => e.eventType === "CONTACT_LOGGED" || e.eventType === "CALL_ENDED").length;
  let followUpState: LeadActionContext["followUp"]["state"] = "NONE";
  if (open) {
    const ms = open.scheduledAt.getTime() - now.getTime();
    followUpState = open.status === "MISSED" || ms < 0 ? "OVERDUE" : ms <= DUE_SOON_MINUTES * 60_000 ? "DUE_SOON" : "UPCOMING";
  }
  let matching = 0;
  if (requirement) {
    // The same explainable matcher the Projects section shows: MATCH means every stated point agrees.
    const shortlistedIds = new Set(shortlist.filter((s) => s.removedAt === null).map((s) => s.projectId));
    const projects = await repos.projects.list({ activeOnly: true, limit: 200 });
    matching = projects.filter((p) => !shortlistedIds.has(p.id) && matchRequirementToProject(requirement, p).overall === "MATCH").length;
  }
  return {
    status: lead.status,
    ownerAssigned: lead.ownerId !== null,
    contactAttempts: attempts,
    lastActivityDaysAgo: Math.max(0, Math.floor((now.getTime() - lead.lastActivityAt.getTime()) / DAY)),
    followUp: { state: followUpState },
    visitAwaitingOutcome: visits.some((v) => (v.status === "SCHEDULED" || v.status === "CONFIRMED") && v.scheduledAt.getTime() <= now.getTime()),
    openVisit: visits.some((v) => v.status === "SCHEDULED" || v.status === "CONFIRMED"),
    lastCall: classified[0] ? { classification: classified[0].classification, disposition: classified[0].disposition } : null,
    hasRequirement: requirement !== null,
    matchingProjects: matching,
    shortlisted: shortlist.filter((s) => s.removedAt === null).length,
  };
}

/** The recommended next step for ONE lead, for an actor allowed to see it. */
export async function getNextStepForLead(repos: LeadRepositories, actor: LeadActor, leadId: string, now: Date = new Date()): Promise<LeadNextStep> {
  assertWorkingActor(actor);
  const lead = typeof leadId === "string" ? await repos.leads.getById(leadId) : null;
  if (!lead || !canViewLead(actor, lead) || lead.erasedAt !== null) throw new LeadNotFoundError("Lead not found.");
  return { leadId, step: nextStep(await getLeadActionContext(repos, lead, now)) };
}

export interface Intelligence {
  /** Leads the Today queue ranks highest, each with its recommended next step (rules, shown as rules). */
  steps: Array<LeadNextStep & { name: string | null; status: LeadStatus }>;
  channels: ChannelQuality[];
  forecast: Forecast;
  readiness: ModelReadiness;
  /** Plain statement of what is and is not running. */
  modelStatus: string;
}

export async function getIntelligence(repos: LeadRepositories, actor: LeadActor, now: Date = new Date()): Promise<Intelligence> {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
  const since = new Date(now.getTime() - 365 * DAY);
  const [rows, stageHistory, statusCounts, queue] = await Promise.all([
    repos.leads.acquisitionRows({ from: since, to: new Date(now.getTime() + DAY), limit: 20_000 }),
    repos.leads.stageHistory(),
    repos.leads.statusCounts(),
    getTodayQueue(repos, now, 12),
  ]);

  const steps: Intelligence["steps"] = [];
  for (const entry of queue) {
    const lead = await repos.leads.getById(entry.leadId);
    if (!lead || lead.erasedAt !== null) continue;
    steps.push({ leadId: lead.id, name: lead.name, status: lead.status, step: nextStep(await getLeadActionContext(repos, lead, now)) });
  }

  const bookings = rows.flatMap((r) => r.bookings);
  const averageCommission: Parameters<typeof forecast>[0]["averageCommission"] = {};
  for (const currency of ["INR", "AED"] as const) {
    const list = bookings.filter((b) => b.currency === currency);
    if (list.length > 0) averageCommission[currency] = { average: list.reduce((n, b) => n + b.commissionExpected, 0) / list.length, bookings: list.length };
  }
  const forecastResult = forecast({
    open: stageHistory.map((s) => ({ stage: s.stage, count: statusCounts[s.stage] ?? 0 })),
    history: stageHistory.map((s) => ({ stage: s.stage, reached: s.reached, booked: s.booked })),
    totalBookings: rows.filter((r) => r.booked).length,
    averageCommission,
  });

  // A lead's outcome is "settled" once it is old enough that a booking would normally have happened (30 days).
  const settled = rows.filter((r) => now.getTime() - r.createdAt.getTime() >= 30 * DAY);
  const readiness = modelReadiness(settled.length, settled.filter((r) => r.booked).length);
  return {
    steps,
    channels: channelQuality(rows),
    forecast: forecastResult,
    readiness,
    modelStatus: readiness.ready
      ? "Enough settled history exists to attempt a conversion model. None has been trained or shown: it must first clear a held-out accuracy bar."
      : "No model is trained and no prediction is shown. Training needs " + readiness.needs.join(" and ") + ".",
  };
}

export { SUFFICIENCY };
