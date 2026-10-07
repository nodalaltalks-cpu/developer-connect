import type { LeadProjectsView } from "./project-service.ts";
import type { MatchCriterion, MatchResult } from "./project-matching.ts";
import type { UpcomingVisit, VisitView } from "./site-visit-service.ts";
import type { SiteVisitOutcome, SiteVisitStatus } from "./types.ts";

/**
 * Serialisable shapes of projects, matches and site visits for screens (times as ISO strings). They carry only what the
 * screens show: no lead phone number, no other buyer's data, no internal ids beyond what an action needs.
 */

export interface MatchRowView {
  projectId: string;
  name: string;
  developerName: string;
  place: string;
  overall: MatchResult;
  criteria: MatchCriterion[];
  /** The active shortlist entry id, when the buyer is shortlisted for this project. */
  shortlistEntryId: string | null;
}

export interface ShortlistHistoryView {
  entryId: string;
  projectName: string;
  developerName: string;
  shortlistedAt: string;
  removedAt: string | null;
}

export interface LeadProjectsViewModel {
  hasRequirement: boolean;
  matches: MatchRowView[];
  history: ShortlistHistoryView[];
}

export function toLeadProjectsViewModel(view: LeadProjectsView): LeadProjectsViewModel {
  return {
    hasRequirement: view.requirement !== null,
    matches: view.matches.map((row) => ({
      projectId: row.project.id,
      name: row.project.name,
      developerName: row.developerName,
      place: [row.project.locality, row.project.city].filter(Boolean).join(", "),
      overall: row.match.overall,
      criteria: row.match.criteria,
      shortlistEntryId: row.shortlisted?.id ?? null,
    })),
    history: view.history.map(({ entry, projectName, developerName }) => ({ entryId: entry.id, projectName, developerName, shortlistedAt: entry.shortlistedAt.toISOString(), removedAt: entry.removedAt ? entry.removedAt.toISOString() : null })),
  };
}

export interface SiteVisitView {
  id: string;
  status: SiteVisitStatus;
  scheduledAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  projectName: string | null;
  outcome: SiteVisitOutcome | null;
  nextAction: string | null;
  notes: string | null;
  rescheduledFromId: string | null;
  awaitingOutcome: boolean;
}

export function toSiteVisitView({ visit, projectName, awaitingOutcome }: VisitView): SiteVisitView {
  return {
    id: visit.id,
    status: visit.status,
    scheduledAt: visit.scheduledAt.toISOString(),
    confirmedAt: visit.confirmedAt ? visit.confirmedAt.toISOString() : null,
    completedAt: visit.completedAt ? visit.completedAt.toISOString() : null,
    projectName,
    outcome: visit.outcome,
    nextAction: visit.nextAction,
    notes: visit.notes,
    rescheduledFromId: visit.rescheduledFrom,
    awaitingOutcome,
  };
}

export type { UpcomingVisit };
