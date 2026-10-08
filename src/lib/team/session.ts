import { auth } from "@clerk/nextjs/server";
import { currentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { resolveEmployeeOrClaim } from "@/lib/staff/employee-access";
import type { StaffMember } from "@/lib/staff/types";
import type { LeadActor } from "@/lib/leads/types";

/**
 * The team workspace's authorization gate - the counterpart of requireFounder for /team. It resolves the signed-in
 * Clerk user to an ACTIVE staff member on the server, every time. Signed-out, unknown, invited-but-not-approved,
 * inactive, exited and Founder accounts all get the same result: no employee.
 *
 * Signing in with Google proves identity and nothing more. The only way a sign-in becomes employee access is a
 * Founder-approved record whose email exactly matches an email Clerk has VERIFIED for that user (first sign-in links
 * them; see claimInvitation). The check runs on the server on every request and every action.
 */

export interface EmployeeSession {
  member: StaffMember;
  actor: LeadActor;
}

/** The emails Clerk has verified for the signed-in user (a Google sign-in's address is verified). Unverified ones are never returned. */
async function verifiedEmails(): Promise<string[]> {
  const user = await currentUser();
  if (!user) return [];
  return user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
}

export async function getEmployee(): Promise<EmployeeSession | null> {
  const { userId } = await auth();
  return resolveEmployeeOrClaim(createPostgresStaffRepository(), userId, verifiedEmails);
}

/** What /team should do for this visitor: show the workspace, say "not approved", or behave as if it does not exist. */
export type TeamAccess = { kind: "employee"; session: EmployeeSession } | { kind: "not-approved" } | { kind: "hidden" };

export async function getTeamAccess(isFounder: (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => boolean): Promise<TeamAccess> {
  const { userId } = await auth();
  if (!userId) return { kind: "hidden" };
  const session = await getEmployee();
  if (session) return { kind: "employee", session };
  const user = await currentUser();
  // The Founder works through /admin; /team is simply not theirs. Everyone else who is signed in but not approved is
  // told so, in one message that does not say whether they were never invited, are pending, or have left.
  if (!user || isFounder(user)) return { kind: "hidden" };
  return { kind: "not-approved" };
}

/** For pages and layouts: anyone who is not an active team member gets a 404 - nothing to reveal. */
export async function requireEmployee(): Promise<EmployeeSession> {
  const employee = await getEmployee();
  if (!employee) notFound();
  return employee;
}

export class NotATeamMemberError extends Error {}

/** For Server Actions - must be called FIRST, like requireFounderForAction. Throws (an action has no render boundary). */
export async function requireEmployeeForAction(): Promise<EmployeeSession> {
  const employee = await getEmployee();
  if (!employee) throw new NotATeamMemberError("Team access required for this action.");
  return employee;
}
