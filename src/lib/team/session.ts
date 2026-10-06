import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { resolveEmployee } from "@/lib/staff/employee-access";
import type { StaffMember } from "@/lib/staff/types";
import type { LeadActor } from "@/lib/leads/types";

/**
 * The team workspace's authorization gate — the counterpart of requireFounder for /team. It resolves the signed-in
 * Clerk user to an ACTIVE staff member on the server, every time. Signed-out, unknown, inactive and Founder
 * accounts all get the same result: no employee.
 */

export interface EmployeeSession {
  member: StaffMember;
  actor: LeadActor;
}

export async function getEmployee(): Promise<EmployeeSession | null> {
  const { userId } = await auth();
  return resolveEmployee(createPostgresStaffRepository(), userId);
}

/** For pages and layouts: anyone who is not an active team member gets a 404 — nothing to reveal. */
export async function requireEmployee(): Promise<EmployeeSession> {
  const employee = await getEmployee();
  if (!employee) notFound();
  return employee;
}

export class NotATeamMemberError extends Error {}

/** For Server Actions — must be called FIRST, like requireFounderForAction. Throws (an action has no render boundary). */
export async function requireEmployeeForAction(): Promise<EmployeeSession> {
  const employee = await getEmployee();
  if (!employee) throw new NotATeamMemberError("Team access required for this action.");
  return employee;
}
