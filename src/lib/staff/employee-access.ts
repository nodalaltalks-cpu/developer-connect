import type { LeadActor } from "../leads/types.ts";
import { UnauthorizedStaffActionError } from "./errors.ts";
import type { StaffRepository } from "./repository.ts";
import { authorizeStaffActor } from "./staff-service.ts";
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
