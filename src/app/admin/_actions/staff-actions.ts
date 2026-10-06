"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { findClerkUserByEmail } from "@/lib/admin-analytics/clerk-users";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { StaffNotFoundError, StaffStateError, StaffValidationError } from "@/lib/staff/errors";
import { addStaffMember, setStaffActive } from "@/lib/staff/staff-service";
import type { LeadActor } from "@/lib/leads/types";

/**
 * Founder-only team management. Every function calls requireFounderForAction FIRST (a Server Action is its own
 * network-callable endpoint); the staff service then refuses any non-FOUNDER actor a second time. Team members are
 * added by the email of an existing sign-in account — the Clerk id is resolved here on the server and never typed
 * or supplied by the browser. Nobody is ever deleted; deactivation ends access and blocks new assignments.
 */

export type StaffActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

function toResult(error: unknown): StaffActionResult {
  if (error instanceof StaffValidationError || error instanceof StaffStateError) return { ok: false, error: error.message };
  if (error instanceof StaffNotFoundError) return { ok: false, error: "That team member could not be found." };
  return { ok: false, error: GENERIC_ERROR };
}

export async function addStaffMemberAction(email: string, displayName: string): Promise<StaffActionResult> {
  const founderId = await requireFounderForAction();
  const actor: LeadActor = { actorType: "FOUNDER", actorId: founderId };
  try {
    const clerkUser = typeof email === "string" ? await findClerkUserByEmail(email) : null;
    if (!clerkUser) {
      return { ok: false, error: "No single account matches that email. Ask them to sign up first, then add them." };
    }
    await addStaffMember(createPostgresStaffRepository(), { userId: clerkUser.id, displayName, email: clerkUser.primaryEmail ?? email }, actor);
  } catch (error) {
    return toResult(error);
  }
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function setStaffActiveAction(staffId: string, active: boolean): Promise<StaffActionResult> {
  const founderId = await requireFounderForAction();
  const actor: LeadActor = { actorType: "FOUNDER", actorId: founderId };
  try {
    await setStaffActive(createPostgresStaffRepository(), staffId, active, actor);
  } catch (error) {
    return toResult(error);
  }
  revalidatePath("/admin/staff");
  revalidatePath("/admin/leads");
  return { ok: true };
}
