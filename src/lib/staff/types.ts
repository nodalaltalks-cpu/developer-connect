/**
 * The sales team. Deliberately small: only what sales operations need to know about a person — who they are
 * (Clerk user id), what to call them, whether they may work leads right now. No HR data.
 *
 * The Founder is NOT a staff member. Founder authority is the Clerk privateMetadata flag (lib/authorization.ts),
 * one source of truth, unchanged. Staff are the people the Founder assigns leads to.
 */

/** Roles a non-founder team member can hold. Only EMPLOYEE is created today; the others are reserved for later team-visibility work. */
export const STAFF_ROLES = ["EMPLOYEE", "SALES_MANAGER", "MANAGER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffMember {
  id: string;
  /** The Clerk user id — the identity a signed-in person is matched on. */
  userId: string;
  displayName: string;
  email: string | null;
  role: StaffRole;
  /** An inactive member can receive no new leads and has no access. Members are never deleted, so history always resolves to a name. */
  active: boolean;
  /** Clerk user id of the founder who added them. */
  createdBy: string;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
