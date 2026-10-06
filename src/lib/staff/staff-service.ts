import type { LeadActor } from "../leads/types.ts";
import { StaffNotFoundError, StaffStateError, StaffValidationError, UnauthorizedStaffActionError } from "./errors.ts";
import type { StaffRepository } from "./repository.ts";
import { STAFF_ROLES, type StaffMember, type StaffRole } from "./types.ts";

/**
 * The team domain service. Framework-free (no Clerk, no Next.js): server actions call requireFounderForAction
 * first, and every management operation here refuses any non-FOUNDER actor a second, independent time — a mistake
 * in one layer cannot silently grant access.
 *
 * A team member is never deleted. Deactivating one stops new assignments and ends their access (the access layer
 * builds an actor only from an ACTIVE member — see authorizeStaffActor); their name stays so old lead history
 * still says who did what.
 */

const MAX_NAME = 100;
const MAX_EMAIL = 254;
/** Clerk user ids look like "user_2abc…". Anything else is not a Clerk identity and is refused before it is stored. */
const CLERK_USER_ID = /^user_[A-Za-z0-9_]{4,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) {
    throw new UnauthorizedStaffActionError("Founder authorization required for team management.");
  }
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new StaffValidationError("displayName", "Enter the team member's name.");
  if (name.length > MAX_NAME) throw new StaffValidationError("displayName", `The name is too long (max ${MAX_NAME} characters).`);
  return name;
}

function cleanEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim() : "";
  if (!email) return null;
  if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StaffValidationError("email", "Enter a valid email address.");
  }
  return email.toLowerCase();
}

export interface AddStaffMemberInput {
  /** The member's Clerk user id (resolved server-side from their email; never typed by hand in the UI). */
  userId: string;
  displayName: string;
  email?: string | null;
  role?: StaffRole;
}

/** Adds a person to the team (founder only). They start active. */
export async function addStaffMember(
  repo: StaffRepository,
  input: AddStaffMemberInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<StaffMember> {
  assertFounder(actor);
  if (typeof input.userId !== "string" || !CLERK_USER_ID.test(input.userId)) {
    throw new StaffValidationError("userId", "That is not a valid sign-in identity.");
  }
  if (input.userId === actor.actorId) {
    throw new StaffValidationError("userId", "You are the Founder — you do not need a team record to work your own leads.");
  }
  const role = input.role ?? "EMPLOYEE";
  if (!(STAFF_ROLES as readonly string[]).includes(role)) throw new StaffValidationError("role", "That role does not exist.");

  const displayName = cleanName(input.displayName);
  const email = cleanEmail(input.email);
  if (await repo.getByUserId(input.userId)) throw new StaffStateError("That person is already on the team.");
  return repo.create({ userId: input.userId, displayName, email, role, createdBy: actor.actorId, now });
}

/**
 * Activates or deactivates a member (founder only). Deactivation records when and by whom. It does not touch the
 * member's leads: the founder reassigns them (a deactivated member's leads stay visible to the founder, flagged).
 */
export async function setStaffActive(
  repo: StaffRepository,
  staffId: string,
  active: boolean,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<StaffMember> {
  assertFounder(actor);
  if (typeof staffId !== "string" || !UUID.test(staffId)) throw new StaffNotFoundError("Team member not found.");
  if (typeof active !== "boolean") throw new StaffValidationError("active", "Choose active or inactive.");

  const member = await repo.getById(staffId);
  if (!member) throw new StaffNotFoundError("Team member not found.");
  if (member.active === active) {
    throw new StaffStateError(active ? `${member.displayName} is already active.` : `${member.displayName} is already inactive.`);
  }
  return repo.update(
    staffId,
    active
      ? { active: true, deactivatedAt: null, deactivatedBy: null }
      : { active: false, deactivatedAt: now, deactivatedBy: actor.actorId },
    now,
  );
}

/** The whole team (founder only), active first. */
export async function listStaff(repo: StaffRepository, actor: LeadActor): Promise<StaffMember[]> {
  assertFounder(actor);
  return repo.list();
}

/**
 * The ONLY way a team member becomes a lead actor. The server layer looks the signed-in Clerk user up in
 * staff_members and passes the row here: no row, or an inactive row, means no actor — and so no access to anything.
 * (Founder authority never comes through here; it is the Clerk metadata flag.)
 */
export function authorizeStaffActor(member: StaffMember | null | undefined): LeadActor {
  if (!member || !member.active) throw new UnauthorizedStaffActionError("This account is not an active team member.");
  return { actorType: "EMPLOYEE", actorId: member.userId };
}

/** userId → display name, for showing owners on screens and in timelines. Includes inactive members (history keeps their name). */
export function staffNameMap(members: readonly StaffMember[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const member of members) names[member.userId] = member.displayName;
  return names;
}
