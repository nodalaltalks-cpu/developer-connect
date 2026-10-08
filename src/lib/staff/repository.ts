import type { StaffEvent, StaffEventType, StaffMember, StaffRole, StaffStatus } from "./types.ts";

/**
 * Persistence contract for the team. The service (staff-service.ts) depends only on this; db/ holds the
 * PostgreSQL adapter and memory-repository.ts the in-memory one used by unit tests - the same layering the lead
 * system uses. There is deliberately NO delete: a member exits, they are never removed. The employee ID is allocated by
 * the repository on create (from a database sequence in PostgreSQL) and cannot be supplied or changed by anyone.
 */

/**
 * A lifecycle event to write in the SAME transaction as the change that caused it. The member change and its audit event
 * commit together or not at all: there is never a changed person without a record of the change.
 */
export interface StaffEventInput {
  eventType: StaffEventType;
  actorId: string | null;
  payload?: Record<string, unknown>;
}

export interface NewStaffMember {
  /** A real Clerk user id, or a placeholder (`invited:<uuid>`) for someone who has not signed in yet. */
  userId: string;
  displayName: string;
  email: string | null;
  role: StaffRole;
  /** Defaults to ACTIVE (a known account added and approved by the Founder in one step). */
  status?: StaffStatus;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  joinedAt?: Date | null;
  createdBy: string;
  now: Date;
}

/** The columns a service may change on an existing member. Identity (id, employeeId, createdBy, createdAt) never changes. */
export type StaffPatch = Partial<
  Pick<StaffMember, "displayName" | "email" | "role" | "status" | "active" | "joinedAt" | "approvedAt" | "approvedBy" | "deactivatedAt" | "deactivatedBy" | "exitedAt" | "exitedBy" | "exitReason">
>;

export interface StaffRepository {
  /** Creates the member and allocates the next permanent employee ID. Throws StaffStateError when the sign-in identity or email is already on the team (the database also enforces it). */
  create(input: NewStaffMember, events?: readonly StaffEventInput[]): Promise<StaffMember>;
  getById(id: string): Promise<StaffMember | null>;
  getByUserId(userId: string): Promise<StaffMember | null>;
  /** By canonical employee ID ("DC2"). */
  getByEmployeeId(employeeId: string): Promise<StaffMember | null>;
  /** The not-yet-linked (INVITED) record whose approved email is exactly `email` (case-insensitive), if any. */
  findUnlinkedByEmail(email: string): Promise<StaffMember | null>;
  /**
   * Atomically links a real sign-in identity to an INVITED, APPROVED, not-yet-linked record and makes it ACTIVE.
   * Returns the member, or null when it could not (not approved, already linked, or another request won the race).
   */
  linkIdentity(id: string, userId: string, at: Date, events?: readonly StaffEventInput[]): Promise<StaffMember | null>;
  /** Everyone, active first, then by employee number - the team is small, so one unpaged read. */
  list(): Promise<StaffMember[]>;
  /** Applies `patch` and sets `updatedAt` to `at`. Throws StaffNotFoundError if there is no such member. */
  update(id: string, patch: StaffPatch, at: Date, events?: readonly StaffEventInput[]): Promise<StaffMember>;
  /** Appends one lifecycle event. Events are never changed or deleted. */
  appendEvent(event: Omit<StaffEvent, "id">): Promise<StaffEvent>;
  /** A member's lifecycle events, oldest first. */
  listEvents(staffId: string, limit: number): Promise<StaffEvent[]>;
}
