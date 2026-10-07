import type { LeadRepositories } from "./repository.ts";
import type { Lead, LeadStatus } from "./types.ts";

/**
 * The forward path of the sales pipeline. Secondary states (NOT_INTERESTED, UNQUALIFIED, WRONG_NUMBER, DUPLICATE, LOST,
 * REVISIT_LATER) are deliberately NOT on it: they are decisions a person makes, never something the system infers.
 */
export const PIPELINE_ORDER: readonly LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];

export function pipelineIndex(status: LeadStatus): number {
  return PIPELINE_ORDER.indexOf(status);
}

/**
 * Moves a lead FORWARD along the pipeline because something real happened (a project was shortlisted, a site visit was
 * booked or completed). Never moves backwards, never touches a secondary or closed-out state, and records a
 * STATUS_CHANGED event (by SYSTEM, with the reason) so the movement is part of the history. Returns whether it moved.
 */
export async function advanceLeadStatus(tx: LeadRepositories, lead: Lead, to: LeadStatus, via: string, now: Date): Promise<boolean> {
  const from = pipelineIndex(lead.status);
  const target = pipelineIndex(to);
  if (from < 0 || target < 0 || from >= target) return false;
  await tx.events.append({ leadId: lead.id, eventType: "STATUS_CHANGED", actorType: "SYSTEM", actorId: null, developerId: null, fromStatus: lead.status, toStatus: to, payload: { via }, createdAt: now });
  await tx.leads.update(lead.id, { status: to, lastActivityAt: now }, now);
  return true;
}
