"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createCampaign, updateCampaign, type CampaignInput } from "@/lib/leads/campaign-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { LeadNotFoundError, LeadStateError, LeadValidationError } from "@/lib/leads/errors";
import type { CampaignStatus } from "@/lib/leads/types";

/**
 * Founder-only campaign actions. Each authorizes the Founder as its very first statement (a Server Action is its own
 * network-callable endpoint); the service then checks again. The actor is built here from the verified session.
 */

export type CampaignActionResult = { ok: true; campaignId?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function createCampaignAction(input: CampaignInput): Promise<CampaignActionResult> {
  const founderId = await requireFounderForAction();
  try {
    const campaign = await createCampaign(createPostgresLeadRepositories(), input, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/campaigns");
    revalidatePath("/admin/acquisition");
    return { ok: true, campaignId: campaign.id };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function setCampaignStatusAction(campaignId: string, status: CampaignStatus): Promise<CampaignActionResult> {
  const founderId = await requireFounderForAction();
  if (typeof campaignId !== "string" || !UUID.test(campaignId)) return { ok: false, error: "That campaign could not be found." };
  try {
    await updateCampaign(createPostgresLeadRepositories(), campaignId, { status }, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/campaigns");
    return { ok: true };
  } catch (error) {
    if (error instanceof LeadValidationError || error instanceof LeadStateError) return { ok: false, error: error.message };
    if (error instanceof LeadNotFoundError) return { ok: false, error: "That campaign could not be found." };
    return { ok: false, error: GENERIC_ERROR };
  }
}
