import type { StaffMember, StaffRole } from "./types.ts";

/**
 * Persistence contract for the team. The service (staff-service.ts) depends only on this; db/ holds the
 * PostgreSQL adapter and memory-repository.ts the in-memory one used by unit tests — the same layering the lead
 * system uses. There is deliberately NO delete: a member is deactivated, never removed.
 */

export interface NewStaffMember {
  userId: string;
  displayName: string;
  email: string | null;
  role: StaffRole;
  createdBy: string;
  now: Date;
}

/** The columns a service may change on an existing member. Identity (id, userId, createdBy, createdAt) never changes. */
export type StaffPatch = Partial<Pick<StaffMember, "displayName" | "email" | "role" | "active" | "deactivatedAt" | "deactivatedBy">>;

export interface StaffRepository {
  /** Creates the member. Throws StaffStateError when that Clerk user is already on the team (the database also enforces it). */
  create(input: NewStaffMember): Promise<StaffMember>;
  getById(id: string): Promise<StaffMember | null>;
  getByUserId(userId: string): Promise<StaffMember | null>;
  /** Everyone, active first, then by name — the team is small, so one unpaged read. */
  list(): Promise<StaffMember[]>;
  /** Applies `patch` and sets `updatedAt` to `at`. Throws StaffNotFoundError if there is no such member. */
  update(id: string, patch: StaffPatch, at: Date): Promise<StaffMember>;
}
