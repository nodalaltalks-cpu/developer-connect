/** Input that cannot become a valid lead/change. `field` names the offending input for the UI. */
export class LeadValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

export class LeadNotFoundError extends Error {}

/** A founder-only operation was attempted by a non-founder actor. */
export class UnauthorizedLeadActionError extends Error {}

/** The change is not allowed in the lead's current state (for example editing an erased lead). */
export class LeadStateError extends Error {}

/**
 * A team member with unresolved missed follow-ups tried to work a lead that has none. They must resolve the missed
 * ones first (complete, reschedule, cancel with a reason, or return the lead).
 */
export class MissedFollowUpBlockError extends LeadStateError {
  readonly missedCount: number;
  constructor(missedCount: number) {
    super(
      missedCount === 1
        ? "You have 1 overdue follow-up. Resolve it before working other leads."
        : `You have ${missedCount} overdue follow-ups. Resolve them before working other leads.`,
    );
    this.missedCount = missedCount;
  }
}
