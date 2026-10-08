import { randomUUID } from "node:crypto";
import type { LeadActor } from "../leads/types.ts";
import { StaffNotFoundError, StaffStateError, StaffValidationError, UnauthorizedStaffActionError } from "./errors.ts";
import { parseEmployeeId } from "./identity.ts";
import type { StaffRepository } from "./repository.ts";
import { EXIT_REASONS, isLinked, PLACEHOLDER_PREFIX, STAFF_ROLES, type ExitReason, type StaffEvent, type StaffMember, type StaffRole } from "./types.ts";

/**
 * The team domain service. Framework-free (no Clerk, no Next.js): server actions call requireFounderForAction
 * first, and every management operation here refuses any non-FOUNDER actor a second, independent time - a mistake
 * in one layer cannot silently grant access.
 *
 * LIFECYCLE (every step is an immutable staff_event with who and when):
 *   invite -> (Founder) approve -> first sign-in with the approved VERIFIED email -> ACTIVE
 *   ACTIVE <-> INACTIVE (switch off / on)        any of them -> EXITED (terminal)
 * A team member is never deleted. Exiting ends access and blocks new assignments; their employee ID, name and every
 * record they created stay, so old lead history still says who did what.
 */

const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_LIST = 500;
/** Clerk user ids look like "user_2abc...". Anything else is not a Clerk identity and is refused before it is stored. */
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

function cleanRole(value: unknown): StaffRole {
  const role = value ?? "EMPLOYEE";
  if (!(STAFF_ROLES as readonly string[]).includes(role as string)) throw new StaffValidationError("role", "That role does not exist.");
  return role as StaffRole;
}

export interface AddStaffMemberInput {
  /** The member's Clerk user id (resolved server-side from their email; never typed by hand in the UI). */
  userId: string;
  displayName: string;
  email?: string | null;
  role?: StaffRole;
}

/**
 * Adds AND approves a person whose sign-in identity is already known (founder only): they start ACTIVE with a fresh
 * permanent employee ID. The Founder is supplying the exact account, which is the approval.
 */
export async function addStaffMember(repo: StaffRepository, input: AddStaffMemberInput, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  if (typeof input.userId !== "string" || !CLERK_USER_ID.test(input.userId)) {
    throw new StaffValidationError("userId", "That is not a valid sign-in identity.");
  }
  if (input.userId === actor.actorId) {
    throw new StaffValidationError("userId", "You are the Founder (DC1) - you do not need a team record to work your own leads.");
  }
  const role = cleanRole(input.role);
  const displayName = cleanName(input.displayName);
  const email = cleanEmail(input.email);
  if (await repo.getByUserId(input.userId)) throw new StaffStateError("That person is already on the team.");
  const member = await repo.create({ userId: input.userId, displayName, email, role, status: "ACTIVE", approvedAt: now, approvedBy: actor.actorId, joinedAt: now, createdBy: actor.actorId, now }, [
    { eventType: "EMPLOYEE_INVITED", actorId: actor.actorId, payload: { role } },
    { eventType: "EMPLOYEE_APPROVED", actorId: actor.actorId },
    { eventType: "EMPLOYEE_ACTIVATED", actorId: actor.actorId, payload: { via: "ADDED_WITH_KNOWN_ACCOUNT" } },
  ]);
  return member;
}

export interface InviteStaffMemberInput {
  displayName: string;
  /** The Gmail (or company) address the person will sign in with. Access is granted only to an exact, verified match. */
  email: string;
  role?: StaffRole;
  /** If a sign-in account with that email already exists, its Clerk id (resolved server-side). Still not approved. */
  userId?: string | null;
}

/**
 * Invites a person (founder only): records their name and the exact email they will sign in with, and gives them their
 * permanent employee ID. They have NO access until the Founder approves them and they then sign in with that email.
 */
export async function inviteStaffMember(repo: StaffRepository, input: InviteStaffMemberInput, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  const email = cleanEmail(input.email);
  if (!email) throw new StaffValidationError("email", "Enter the email address they will sign in with.");
  const displayName = cleanName(input.displayName);
  const role = cleanRole(input.role);
  let userId = `${PLACEHOLDER_PREFIX}${randomUUID()}`;
  if (input.userId) {
    if (typeof input.userId !== "string" || !CLERK_USER_ID.test(input.userId)) throw new StaffValidationError("userId", "That is not a valid sign-in identity.");
    if (input.userId === actor.actorId) throw new StaffValidationError("userId", "You are the Founder (DC1) - you do not need a team record to work your own leads.");
    if (await repo.getByUserId(input.userId)) throw new StaffStateError("That person is already on the team.");
    userId = input.userId;
  }
  const member = await repo.create({ userId, displayName, email, role, status: "INVITED", approvedAt: null, createdBy: actor.actorId, now }, [{ eventType: "EMPLOYEE_INVITED", actorId: actor.actorId, payload: { role } }]);
  return member;
}

/**
 * Approves an invited person (founder only). From now on a sign-in with their exact verified email gives them access;
 * if they are already linked to a sign-in account they become ACTIVE immediately.
 */
export async function approveStaffMember(repo: StaffRepository, staffId: string, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  const member = await loadMember(repo, staffId);
  if (member.status === "EXITED") throw new StaffStateError(`${member.employeeId} has exited and cannot be approved.`);
  if (member.status !== "INVITED") throw new StaffStateError(`${member.employeeId} is already approved.`);
  if (member.approvedAt) throw new StaffStateError(`${member.employeeId} is already approved and is waiting for their first sign-in.`);
  const linked = isLinked(member);
  const updated = await repo.update(member.id, linked ? { approvedAt: now, approvedBy: actor.actorId, status: "ACTIVE", joinedAt: member.joinedAt ?? now } : { approvedAt: now, approvedBy: actor.actorId }, now, [
    { eventType: "EMPLOYEE_APPROVED", actorId: actor.actorId },
    ...(linked ? [{ eventType: "EMPLOYEE_ACTIVATED" as const, actorId: actor.actorId, payload: { via: "APPROVED_WITH_LINKED_ACCOUNT" } }] : []),
  ]);
  return updated;
}

/**
 * First sign-in. Given the signed-in Clerk user and the emails Clerk has VERIFIED for them, links the user to the
 * invited record whose approved email matches EXACTLY - and only if the Founder approved that record. Anything else
 * (unknown email, not yet approved, unverified email) returns null and changes nothing. Authentication proved who they
 * are; this is the only place that proof is turned into access, and only against a Founder-approved record.
 */
export async function claimInvitation(repo: StaffRepository, clerkUserId: string | null | undefined, verifiedEmails: readonly string[], now: Date = new Date()): Promise<StaffMember | null> {
  if (typeof clerkUserId !== "string" || !CLERK_USER_ID.test(clerkUserId)) return null;
  if (await repo.getByUserId(clerkUserId)) return null; // already on the team (or exited): nothing to claim
  for (const raw of verifiedEmails.slice(0, 5)) {
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!email) continue;
    const invited = await repo.findUnlinkedByEmail(email);
    if (!invited || !invited.approvedAt) continue;
    const linked = await repo.linkIdentity(invited.id, clerkUserId, now, [{ eventType: "EMPLOYEE_ACTIVATED", actorId: clerkUserId, payload: { via: "FIRST_SIGN_IN" } }]);
    if (!linked) continue; // another request got there first
    return linked;
  }
  return null;
}

async function loadMember(repo: StaffRepository, staffId: string): Promise<StaffMember> {
  if (typeof staffId !== "string" || !UUID.test(staffId)) throw new StaffNotFoundError("Team member not found.");
  const member = await repo.getById(staffId);
  if (!member) throw new StaffNotFoundError("Team member not found.");
  return member;
}

/**
 * Switches an ACTIVE member off, or an INACTIVE one back on (founder only). Records when and by whom. It does not touch
 * the member's leads: the founder reassigns them. An invited person is approved, not "activated"; an exited person
 * stays exited.
 */
export async function setStaffActive(repo: StaffRepository, staffId: string, active: boolean, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  if (typeof staffId !== "string" || !UUID.test(staffId)) throw new StaffNotFoundError("Team member not found.");
  if (typeof active !== "boolean") throw new StaffValidationError("active", "Choose active or inactive.");

  const member = await repo.getById(staffId);
  if (!member) throw new StaffNotFoundError("Team member not found.");
  if (member.status === "EXITED") throw new StaffStateError(`${member.displayName} has exited and cannot be reactivated.`);
  if (member.status === "INVITED") throw new StaffStateError(`${member.displayName} has not been approved and signed in yet.`);
  if (member.active === active) {
    throw new StaffStateError(active ? `${member.displayName} is already active.` : `${member.displayName} is already inactive.`);
  }
  const updated = await repo.update(
    staffId,
    active ? { status: "ACTIVE", deactivatedAt: null, deactivatedBy: null } : { status: "INACTIVE", deactivatedAt: now, deactivatedBy: actor.actorId },
    now,
    [{ eventType: active ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED", actorId: actor.actorId }],
  );
  return updated;
}

/**
 * Records that a team member has left (founder only). Terminal: their access ends at once (every access check reads
 * `active`, which this clears), they can receive nothing new, and NOTHING they did is touched - the employee ID, the
 * name, their calls, leads, follow-ups, requirements, visits and bookings all stay attributed to them. The reason is a
 * structured code, not free text.
 */
export async function exitStaffMember(repo: StaffRepository, staffId: string, reason: ExitReason, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  if (!(EXIT_REASONS as readonly string[]).includes(reason)) throw new StaffValidationError("reason", "Choose why they are leaving.");
  const member = await loadMember(repo, staffId);
  if (member.status === "EXITED") throw new StaffStateError(`${member.employeeId} has already exited.`);
  const updated = await repo.update(member.id, { status: "EXITED", exitedAt: now, exitedBy: actor.actorId, exitReason: reason, deactivatedAt: member.deactivatedAt ?? now, deactivatedBy: member.deactivatedBy ?? actor.actorId }, now, [
    { eventType: "EMPLOYEE_EXITED", actorId: actor.actorId, payload: { reason, previousStatus: member.status } },
  ]);
  return updated;
}

/**
 * Changes the approved sign-in email of a team member (founder only). The employee ID, the linked sign-in identity,
 * ownership and every historical record are untouched: only the address the Founder approved changes, and the old and
 * new address are written to the append-only event log, so the full email history is always recoverable.
 *
 * What this does for each state:
 *  - INVITED, not yet signed in: the new address is the one that will be matched at first sign-in.
 *  - Already signed in (ACTIVE / INACTIVE): they keep working through the same sign-in account (history is keyed to it);
 *    the record now shows the new address. It is not a way to move someone to a different Google account.
 * An exited person cannot be changed, and an address already used by another live team member is refused.
 */
export async function changeStaffEmail(repo: StaffRepository, staffId: string, newEmail: string, actor: LeadActor, now: Date = new Date()): Promise<StaffMember> {
  assertFounder(actor);
  const email = cleanEmail(newEmail);
  if (!email) throw new StaffValidationError("email", "Enter the new email address.");
  const member = await loadMember(repo, staffId);
  if (member.status === "EXITED") throw new StaffStateError(`${member.employeeId} has exited and cannot be changed.`);
  if (member.email === email) throw new StaffStateError("That is already their email address.");
  const taken = (await repo.list()).some((other) => other.id !== member.id && other.status !== "EXITED" && other.email === email);
  if (taken) throw new StaffStateError("That email address already belongs to another team member.");
  const updated = await repo.update(member.id, { email }, now, [{ eventType: "EMPLOYEE_EMAIL_CHANGED", actorId: actor.actorId, payload: { from: member.email, to: email, status: member.status } }]);
  return updated;
}

/** The whole team (founder only), active first. */
export async function listStaff(repo: StaffRepository, actor: LeadActor): Promise<StaffMember[]> {
  assertFounder(actor);
  return repo.list();
}

/** Opens a member by their employee ID - "dc2", " DC2 " and "DC2" are the same (founder only). null when there is no such ID. */
export async function findStaffByEmployeeId(repo: StaffRepository, raw: string, actor: LeadActor): Promise<StaffMember | null> {
  assertFounder(actor);
  const id = parseEmployeeId(raw);
  return id ? repo.getByEmployeeId(id) : null;
}

export async function listStaffEvents(repo: StaffRepository, staffId: string, actor: LeadActor, limit = MAX_LIST): Promise<StaffEvent[]> {
  assertFounder(actor);
  const member = await loadMember(repo, staffId);
  return repo.listEvents(member.id, Math.min(Math.max(limit, 1), MAX_LIST));
}

/**
 * The ONLY way a team member becomes a lead actor. The server layer looks the signed-in Clerk user up in
 * staff_members and passes the row here: no row, or an inactive/invited/exited row, means no actor - and so no access
 * to anything. (Founder authority never comes through here; it is the Clerk metadata flag.)
 */
export function authorizeStaffActor(member: StaffMember | null | undefined): LeadActor {
  if (!member || !member.active || member.status !== "ACTIVE" || !isLinked(member)) throw new UnauthorizedStaffActionError("This account is not an active team member.");
  return { actorType: "EMPLOYEE", actorId: member.userId };
}

/** userId -> "DC2 · Name", for showing owners on screens and in timelines. Includes inactive and exited members: history keeps their ID and name, with an "(exited)" marker. */
export function staffNameMap(members: readonly StaffMember[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const member of members) names[member.userId] = `${member.employeeId} · ${member.displayName}${member.status === "EXITED" ? " (exited)" : ""}`;
  return names;
}
