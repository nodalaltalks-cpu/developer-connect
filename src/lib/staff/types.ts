/**
 * The team. Deliberately small: only what sales operations need to know about a person - who they are (Clerk user id
 * once linked, plus the approved sign-in email), what to call them, their permanent employee ID, and where they stand.
 * No HR data (no salary, no address, no documents).
 *
 * The Founder is NOT a staff member. Founder authority is the Clerk privateMetadata flag (lib/authorization.ts), one
 * source of truth, unchanged. The Founder is shown as DC1 (see identity.ts). Staff are the people the Founder assigns
 * leads to.
 *
 * AUTHENTICATION IS NOT AUTHORIZATION. Signing in with Google only proves who someone is. Access exists only when the
 * Founder has APPROVED that exact verified email; until then (and after they exit) the sign-in is denied.
 */

/** Roles a non-founder team member can hold. Only EMPLOYEE is created today; the others are reserved for later team-visibility work. */
export const STAFF_ROLES = ["EMPLOYEE", "SALES_MANAGER", "MANAGER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * INVITED  - the Founder recorded them (and an approved sign-in email). No access. If the Founder has also approved them,
 *            they are waiting for their first sign-in; if not, they are waiting for approval.
 * ACTIVE   - approved and signed in with the approved verified email. Access allowed.
 * INACTIVE - switched off for now; may be switched back on.
 * EXITED   - left the company. Terminal: no access, no reactivation, every record kept.
 */
export const STAFF_STATUSES = ["INVITED", "ACTIVE", "INACTIVE", "EXITED"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const EXIT_REASONS = ["RESIGNED", "TERMINATED", "CONTRACT_ENDED", "OTHER"] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export interface StaffMember {
  id: string;
  /** The permanent employee ID ("DC2"). Never changes, never reused. */
  employeeId: string;
  /** The Clerk user id once they have signed in with their approved email; `invited:<uuid>` until then (see isLinked). */
  userId: string;
  displayName: string;
  /** The approved sign-in email (lower case). Access is granted by an exact, verified match against it. */
  email: string | null;
  role: StaffRole;
  status: StaffStatus;
  /** Kept equal to (status === "ACTIVE") - the single flag every access check uses. */
  active: boolean;
  /** Clerk user id of the founder who added them. */
  createdBy: string;
  joinedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  exitedAt: Date | null;
  exitedBy: string | null;
  exitReason: ExitReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PLACEHOLDER_PREFIX = "invited:";

/** Has this person signed in and been linked to a real sign-in identity? */
export function isLinked(member: Pick<StaffMember, "userId">): boolean {
  return !member.userId.startsWith(PLACEHOLDER_PREFIX);
}

export const STAFF_EVENT_TYPES = ["EMPLOYEE_INVITED", "EMPLOYEE_APPROVED", "EMPLOYEE_ACTIVATED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_REACTIVATED", "EMPLOYEE_EXITED", "EMPLOYEE_EMAIL_CHANGED"] as const;
export type StaffEventType = (typeof STAFF_EVENT_TYPES)[number];

export interface StaffEvent {
  id: string;
  staffId: string;
  employeeId: string;
  eventType: StaffEventType;
  /** The Clerk user id of whoever did it. */
  actorId: string | null;
  occurredAt: Date;
  /** Ids and enums only. */
  payload: Record<string, unknown>;
}
