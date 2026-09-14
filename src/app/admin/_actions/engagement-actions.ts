"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import type { InaccuracyReportStatus, ContactStatus } from "@/lib/engagement/types";

/**
 * Founder-only status updates for the three admin tracking pages
 * (/admin/reports, /admin/contact, /admin/newsletter). Every function
 * calls requireFounderForAction FIRST, same pattern as
 * verification-actions.ts / developer-actions.ts. revalidatePath is the
 * "real-time" mechanism (Part 30/13-14): the next page load/refresh
 * always reads current database state — no client cache, no
 * WebSockets, no second real-time infrastructure.
 */

const AUTH_ERROR = "You don't have permission to do that. Founder access is required.";

export interface UpdateStatusResult {
  ok: boolean;
  error?: string;
}

export async function updateInaccuracyReportStatusAction(
  id: string,
  status: InaccuracyReportStatus,
): Promise<UpdateStatusResult> {
  try {
    await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  const updated = await engagement.reports.updateStatus(id, status);
  if (!updated) return { ok: false, error: "This report could not be found. It may have been removed." };
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function updateContactSubmissionStatusAction(
  id: string,
  status: ContactStatus,
): Promise<UpdateStatusResult> {
  try {
    await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  const updated = await engagement.contact.updateStatus(id, status);
  if (!updated) return { ok: false, error: "This message could not be found. It may have been removed." };
  revalidatePath("/admin/contact");
  return { ok: true };
}
