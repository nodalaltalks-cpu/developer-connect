import { UnauthorizedLeadActionError } from "./errors.ts";
import { endOfDayIn } from "./lead-views.ts";
import { buildAttention, THRESHOLDS, type AttentionItem } from "./command-centre.ts";
import { getEmployeeInsights, type EmployeeInsightRow, type InsightFilters } from "./call-analytics.ts";
import { getFinanceView } from "./finance-service.ts";
import { CURRENCIES, type FinanceGroup } from "./finance.ts";
import { getFounderAttention } from "./follow-up-reads.ts";
import type { LeadRepositories } from "./repository.ts";
import type { StaffRepository } from "../staff/repository.ts";
import { LEAD_STATUSES, type LeadActor, type LeadCurrency, type LeadStatus } from "./types.ts";
import { PIPELINE_ORDER } from "./pipeline.ts";

/**
 * The Founder's Command Centre read model. Founder only; read-only; every figure comes from the same services the
 * detailed screens use (finance, acquisition, employee insights, follow-up discipline), so the summary can never
 * disagree with the detail. It answers four questions in order: what needs attention, what happened, why, and who/what
 * is responsible - and every block links to the screen where it can be acted on.
 */

export interface PipelineStep {
  status: LeadStatus;
  count: number;
}

export interface ProjectDemand {
  projectId: string;
  name: string;
  developerName: string;
  shortlisted: number;
  visits: number;
  bookings: number;
}

export interface CommandCentre {
  range: InsightFilters["range"];
  attention: AttentionItem[];
  overview: {
    leads: number;
    qualified: number;
    siteVisits: number;
    bookings: number;
    /** Per currency: spend, commission received, commission outstanding (all live bookings) and ROI. Never mixed. */
    money: Partial<Record<LeadCurrency, { spend: number; received: number; outstanding: number; roi: number | null }>>;
  };
  sales: {
    /** Where every live lead is right now, along the forward path, then the secondary states. */
    pipeline: PipelineStep[];
    secondary: PipelineStep[];
    /** Share of leads created in the range that reached each stage; null when there were no leads. */
    conversion: { qualified: number | null; siteVisit: number | null; booked: number | null };
    calls: { dialed: number; connected: number; talkSeconds: number };
    followUps: { created: number; completed: number; missedNow: number };
    siteVisits: { scheduled: number; completed: number; noShow: number };
  };
  acquisition: FinanceGroup[];
  projects: ProjectDemand[];
  employees: EmployeeInsightRow[];
  truncated: boolean;
}

function assertFounder(actor: LeadActor): void {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required.");
}

const DAY = 86_400_000;
const rate = (n: number, d: number) => (d > 0 ? n / d : null);

export async function getCommandCentre(repos: LeadRepositories, staff: StaffRepository, actor: LeadActor, filters: InsightFilters, now: Date = new Date()): Promise<CommandCentre> {
  assertFounder(actor);
  const range = { from: filters.range.from, to: filters.range.to };
  const [finance, insights, attention, statusCounts, exceptions, openVisits, shortlisted, visitsByProject, projects] = await Promise.all([
    getFinanceView(repos, actor, range, "first"),
    getEmployeeInsights(repos, staff, actor, { ...filters, employeeId: undefined }, now),
    getFounderAttention(repos, actor, now),
    repos.leads.statusCounts(),
    repos.leads.exceptionCounts({ unassignedOlderThan: new Date(now.getTime() - THRESHOLDS.UNASSIGNED_HOURS * 3_600_000), staleBefore: new Date(now.getTime() - THRESHOLDS.STALE_DAYS * DAY) }),
    repos.siteVisits.list({ statuses: ["SCHEDULED", "CONFIRMED"], to: now, limit: 1000 }),
    repos.shortlist.countActiveByProject(),
    repos.siteVisits.countByProject(range.from, range.to),
    repos.projects.list({ activeOnly: false, limit: 200 }),
  ]);
  const { report } = finance;
  const totals = report.totals;

  // Four more things the Founder watches, each a count of real records (bounded reads).
  const endOfToday = endOfDayIn(now);
  const [hotOpen, visitsToday, team] = await Promise.all([
    repos.leads.list({ view: "hot", limit: 200, offset: 0, now, endOfToday }),
    repos.siteVisits.list({ statuses: ["SCHEDULED", "CONFIRMED"], from: now, to: endOfToday, limit: 500 }),
    staff.list(),
  ]);
  const hotQuiet = hotOpen.leads.filter((l) => now.getTime() - l.lastActivityAt.getTime() >= DAY).length;
  const visitsTodayCount = visitsToday.length;
  const pendingApprovals = team.filter((m) => m.status === "INVITED" && !m.approvedAt).length;

  // Commission still unpaid past the chase window, per currency.
  const overdueCommission: Partial<Record<LeadCurrency, { amount: number; bookings: number }>> = {};
  const cutoff = now.getTime() - THRESHOLDS.COMMISSION_CHASE_DAYS * DAY;
  for (const { booking, outstanding } of finance.outstanding) {
    if (booking.bookedAt.getTime() > cutoff || outstanding <= 0) continue;
    const cell = (overdueCommission[booking.currency] ??= { amount: 0, bookings: 0 });
    cell.amount += outstanding;
    cell.bookings += 1;
  }

  const money: CommandCentre["overview"]["money"] = {};
  for (const currency of CURRENCIES) {
    const m = totals.money[currency];
    if (m || finance.outstandingTotals[currency]) money[currency] = { spend: m?.spend ?? 0, received: m?.commissionReceived ?? 0, outstanding: finance.outstandingTotals[currency] ?? 0, roi: m?.roi ?? null };
  }

  const sum = <K extends keyof EmployeeInsightRow["contribution"]>(k: K) => insights.rows.reduce((n, r) => n + (r.contribution[k] as number), 0);
  const names = await repos.leads.developerNames([...new Set(projects.map((p) => p.developerId))]);
  const bookingsByProject = new Map(report.byProject.map((g) => [g.key, g.counts.bookings]));
  const demand = projects
    .map((p): ProjectDemand => ({ projectId: p.id, name: p.name, developerName: names[p.developerId] ?? "Unknown developer", shortlisted: shortlisted[p.id] ?? 0, visits: visitsByProject[p.id] ?? 0, bookings: bookingsByProject.get(p.id) ?? 0 }))
    .filter((p) => p.shortlisted + p.visits + p.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings || b.visits - a.visits || b.shortlisted - a.shortlisted)
    .slice(0, 8);

  const secondary = LEAD_STATUSES.filter((s) => !PIPELINE_ORDER.includes(s));
  return {
    range: filters.range,
    attention: buildAttention({
      newLeads: statusCounts.NEW ?? 0,
      untouchedHot: hotQuiet,
      visitsToday: visitsTodayCount,
      pendingApprovals,
      missedFollowUps: attention.missed,
      returnedLeads: attention.returned,
      visitsAwaitingOutcome: openVisits.length,
      unassignedOpen: exceptions.unassignedOpen,
      unassignedOld: exceptions.unassignedOld,
      staleOpen: exceptions.staleOpen,
      channels: report.byChannel,
      totalLeads: totals.counts.leads,
      totalQualified: totals.counts.qualified,
      overdueCommission,
    }),
    overview: { leads: totals.counts.leads, qualified: totals.counts.qualified, siteVisits: totals.counts.siteVisits, bookings: totals.counts.bookings, money },
    sales: {
      pipeline: PIPELINE_ORDER.map((status) => ({ status, count: statusCounts[status] ?? 0 })),
      secondary: secondary.map((status) => ({ status, count: statusCounts[status] ?? 0 })).filter((s) => s.count > 0),
      conversion: { qualified: rate(totals.counts.qualified, totals.counts.leads), siteVisit: rate(totals.counts.siteVisits, totals.counts.leads), booked: rate(totals.counts.bookings, totals.counts.leads) },
      calls: { dialed: insights.totals.dialed, connected: insights.totals.connected, talkSeconds: insights.totals.talkSeconds },
      followUps: { created: insights.rows.reduce((n, r) => n + r.followUps.created, 0), completed: insights.rows.reduce((n, r) => n + r.followUps.completed, 0), missedNow: insights.rows.reduce((n, r) => n + r.followUps.missedNow, 0) },
      siteVisits: { scheduled: sum("siteVisitsScheduled"), completed: sum("siteVisitsCompleted"), noShow: sum("siteVisitsNoShow") },
    },
    acquisition: report.byChannel.slice(0, 6),
    projects: demand,
    employees: insights.rows.filter((r) => r.active || r.calls.dialed > 0 || r.contribution.ownedLeads > 0),
    truncated: report.truncated,
  };
}
