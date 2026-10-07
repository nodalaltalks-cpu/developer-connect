"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { LeadNotFoundError, LeadStateError, LeadValidationError } from "@/lib/leads/errors";
import { recordSpend, voidSpend, type SpendInput } from "@/lib/leads/finance-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { createBooking, updateBooking } from "@/lib/leads/lead-service";
import type { LeadCurrency } from "@/lib/leads/types";

/**
 * Founder-only finance actions: record a booking, record commission received, record and void marketing spend. Each
 * authorizes the Founder as its very first statement (a Server Action is its own network-callable endpoint); the
 * services check again. Times are the server's; the browser supplies amounts and ids only.
 */

export type FinanceActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please try again.";

function fail(error: unknown): FinanceActionResult {
  if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
  if (error instanceof LeadNotFoundError) return { ok: false, error: "That record could not be found." };
  return { ok: false, error: GENERIC_ERROR };
}

export async function createBookingAction(leadId: string, input: { currency: LeadCurrency; bookingValue: number; commissionExpected: number; projectId?: string | null; projectName?: string | null }): Promise<FinanceActionResult> {
  const founderId = await requireFounderForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId)) return { ok: false, error: "That lead could not be found." };
  if (input?.projectId != null && (typeof input.projectId !== "string" || !UUID.test(input.projectId))) return { ok: false, error: "Choose a project from the list." };
  try {
    await createBooking(createPostgresLeadRepositories(), leadId, { currency: input.currency, bookingValue: input.bookingValue, commissionExpected: input.commissionExpected, projectId: input.projectId || null, projectName: input.projectName || null }, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/finance");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Records the TOTAL commission received so far on a booking (cumulative); the received-at time is the server's now. */
export async function recordCommissionReceivedAction(leadId: string, bookingId: string, totalReceived: number): Promise<FinanceActionResult> {
  const founderId = await requireFounderForAction();
  if (typeof leadId !== "string" || !UUID.test(leadId) || typeof bookingId !== "string" || !UUID.test(bookingId)) return { ok: false, error: "That booking could not be found." };
  try {
    const repos = createPostgresLeadRepositories();
    const booking = await repos.bookings.getById(bookingId);
    // A booking reached through a different lead's page is "not found".
    if (!booking || booking.leadId !== leadId) return { ok: false, error: "That booking could not be found." };
    await updateBooking(repos, bookingId, { commissionReceived: totalReceived, commissionReceivedAt: new Date() }, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/finance");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function recordSpendAction(input: SpendInput): Promise<FinanceActionResult> {
  const founderId = await requireFounderForAction();
  if (input?.campaignId != null && input.campaignId !== "" && (typeof input.campaignId !== "string" || !UUID.test(input.campaignId))) return { ok: false, error: "Choose a campaign from the list." };
  try {
    await recordSpend(createPostgresLeadRepositories(), { ...input, campaignId: input.campaignId || null }, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/spend");
    revalidatePath("/admin/finance");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function voidSpendAction(spendId: string, reason: string): Promise<FinanceActionResult> {
  const founderId = await requireFounderForAction();
  if (typeof spendId !== "string" || !UUID.test(spendId)) return { ok: false, error: "That entry could not be found." };
  try {
    await voidSpend(createPostgresLeadRepositories(), spendId, reason, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/spend");
    revalidatePath("/admin/finance");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
