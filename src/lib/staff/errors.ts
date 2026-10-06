/** Input that cannot become a valid team member. `field` names the offending input for the UI. */
export class StaffValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

export class StaffNotFoundError extends Error {}

/** The change is not allowed in the member's current state (already on the team, already inactive...). */
export class StaffStateError extends Error {}

/** A founder-only team operation was attempted by anyone else, or a non-active member tried to act. */
export class UnauthorizedStaffActionError extends Error {}
