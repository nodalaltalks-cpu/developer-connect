"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import type { InaccuracyReportStatus } from "@/lib/engagement/types";

/**
 * Founder-only status updates for /admin/reports and /admin/newsletter.
 * (Contact's own status/trash/restore/permanent-delete actions moved to
 * contact-actions.ts — a richer case-management flow with history and
 * notifications that this simple updateStatus-and-revalidate shape can't
 * represent; see contact-actions.ts's own doc comment.) Every function
 * calls requireFounderForAction FIRST, same pattern as
 * verification-actions.ts / developer-actions.ts. revalidatePath is the
 * "real-time" mechanism: the next page load/refresh always reads current
 * database state — no client cache, no WebSockets, no second real-time
 * infrastructure.
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
