import type { FollowUpStatus, FollowUpType, LeadFollowUp } from "./types.ts";

/**
 * The serialisable shape of a follow-up for screens (times as ISO strings), plus the pure helpers the follow-up
 * section uses. The server decides what is overdue (`scheduled_at < now` while still open); the screen only shows it.
 */
export interface FollowUpView {
  id: string;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduledAt: string;
  missedCount: number;
  rescheduleCount: number;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export function toFollowUpView(followUp: LeadFollowUp): FollowUpView {
  return {
    id: followUp.id,
    type: followUp.type,
    status: followUp.status,
    scheduledAt: followUp.scheduledAt.toISOString(),
    missedCount: followUp.missedCount,
    rescheduleCount: followUp.rescheduleCount,
    cancelReason: followUp.cancelReason,
    completedAt: followUp.completedAt ? followUp.completedAt.toISOString() : null,
    cancelledAt: followUp.cancelledAt ? followUp.cancelledAt.toISOString() : null,
    createdAt: followUp.createdAt.toISOString(),
  };
}

/** The follow-up that needs action: SCHEDULED or MISSED. At most one per lead. */
export function openFollowUp(followUps: readonly FollowUpView[]): FollowUpView | null {
  return followUps.find((followUp) => followUp.status === "SCHEDULED" || followUp.status === "MISSED") ?? null;
}

/** True when the follow-up is open and its exact time has passed — the server's definition of missed. */
export function isOverdue(followUp: Pick<FollowUpView, "status" | "scheduledAt">, now: Date): boolean {
  return (followUp.status === "SCHEDULED" || followUp.status === "MISSED") && new Date(followUp.scheduledAt).getTime() < now.getTime();
}
