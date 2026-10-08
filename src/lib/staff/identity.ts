import type { StaffMember } from "./types.ts";

/**
 * How people are named in the product. A name can change; an employee ID does not, so wherever someone is shown, the ID
 * leads: "DC2 · Rahul Sharma". Pure and framework-free.
 */

/** The Founder, DC1. Deliberately a constant, not a staff row: Founder authority stays the Clerk privateMetadata flag. */
export const FOUNDER_IDENTITY = { employeeId: "DC1", name: "Ambish Singh", role: "Founder" } as const;

export const founderLabel = () => `${FOUNDER_IDENTITY.employeeId} · ${FOUNDER_IDENTITY.name} · ${FOUNDER_IDENTITY.role}`;

export const employeeLabel = (member: Pick<StaffMember, "employeeId" | "displayName">) => `${member.employeeId} · ${member.displayName}`;

const ID_PATTERN = /^DC[1-9][0-9]{0,8}$/;

/** "dc2", " DC2 " and "DC2" are the same ID. Anything else is not an employee ID (null). */
export function parseEmployeeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const canonical = raw.trim().toUpperCase();
  return ID_PATTERN.test(canonical) ? canonical : null;
}

/** userId -> "DC2 · Rahul Sharma", for owners and actors on Founder screens. Includes exited members (history keeps its label). */
export function staffLabelMap(members: readonly Pick<StaffMember, "userId" | "employeeId" | "displayName">[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const m of members) labels[m.userId] = employeeLabel(m);
  return labels;
}

export const STATUS_LABEL: Record<StaffMember["status"], string> = { INVITED: "Invited", ACTIVE: "Active", INACTIVE: "Inactive", EXITED: "Exited" };

/** What the Founder should read under an INVITED person's name. */
export function invitedDetail(member: Pick<StaffMember, "status" | "approvedAt">): string | null {
  if (member.status !== "INVITED") return null;
  return member.approvedAt ? "Approved - waiting for their first sign-in" : "Waiting for your approval";
}
