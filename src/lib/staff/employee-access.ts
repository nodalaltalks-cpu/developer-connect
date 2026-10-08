import type { LeadActor } from "../leads/types.ts";
import { UnauthorizedStaffActionError } from "./errors.ts";
import type { StaffRepository } from "./repository.ts";
import { authorizeStaffActor, claimInvitation } from "./staff-service.ts";
import type { StaffMember } from "./types.ts";

/**
 * Turns a verified sign-in identity into a team-member actor — or into nothing. The ONLY input is the user id the
 * server got from the authenticated session (never a staff id, owner id or form field). Unknown accounts and
 * deactivated members get the same answer (null), so a caller cannot tell "not on the team" from "switched off".
 * The Founder is not a staff row and gets null here: the Founder works through /admin.
 */
export async function resolveEmployee(
  repo: StaffRepository,
  clerkUserId: string | null | undefined,
): Promise<{ member: StaffMember; actor: LeadActor } | null> {
  if (typeof clerkUserId !== "string" || clerkUserId === "") return null;
  const member = await repo.getByUserId(clerkUserId);
  try {
    return { member: member!, actor: authorizeStaffActor(member) };
  } catch (error) {
    if (error instanceof UnauthorizedStaffActionError) return null;
    throw error;
  }
}

/**
 * The same, for a person who has signed in but is not (yet) linked: if the Founder has approved the exact VERIFIED email
 * they signed in with, this links them (their first sign-in) and returns the employee. An unknown account, an account
 * the Founder has not approved, an unverified email, a pending or exited person - all return null, and nothing changes.
 * Authentication proved who they are; only a Founder-approved record turns that into access.
 */
export async function resolveEmployeeOrClaim(
  repo: StaffRepository,
  clerkUserId: string | null | undefined,
  verifiedEmails: () => Promise<readonly string[]>,
  now: Date = new Date(),
): Promise<{ member: StaffMember; actor: LeadActor } | null> {
  const existing = await resolveEmployee(repo, clerkUserId);
  if (existing) return existing;
  const claimed = await claimInvitation(repo, clerkUserId, await verifiedEmails(), now);
  if (!claimed) return null;
  return resolveEmployee(repo, clerkUserId);
}
