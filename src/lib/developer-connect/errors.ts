export class NotFoundError extends Error {}

export class InvalidUrlError extends Error {}

export class InvalidTransitionError extends Error {}

export class UnauthorizedVerificationActionError extends Error {}

export class DuplicateCandidateError extends Error {
  readonly existingCandidateId: string;

  constructor(message: string, existingCandidateId: string) {
    super(message);
    this.existingCandidateId = existingCandidateId;
  }
}

/**
 * Thrown when approving a candidate would make the same canonical domain
 * VERIFIED for two different developers at once. This is never
 * auto-resolved — it requires a founder to manually investigate which
 * developer actually owns the domain.
 */
export class CrossDeveloperDomainConflictError extends Error {
  readonly conflictingDeveloperId: string;
  readonly conflictingCandidateId: string;

  constructor(message: string, conflictingDeveloperId: string, conflictingCandidateId: string) {
    super(message);
    this.conflictingDeveloperId = conflictingDeveloperId;
    this.conflictingCandidateId = conflictingCandidateId;
  }
}
