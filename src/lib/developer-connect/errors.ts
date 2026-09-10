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
