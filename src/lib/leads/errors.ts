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
