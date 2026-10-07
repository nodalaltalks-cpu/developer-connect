"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { runAutomationsAsFounder, setAutomationEnabled } from "@/lib/leads/automation-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { LeadValidationError } from "@/lib/leads/errors";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

/** Founder-only automation actions. Each authorizes the Founder as its first statement; the service checks again. */

export type AutomationActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function setAutomationEnabledAction(rule: string, enabled: boolean): Promise<AutomationActionResult> {
  const founderId = await requireFounderForAction();
  try {
    await setAutomationEnabled(createPostgresLeadRepositories(), rule, enabled, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/sales-automation");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof LeadValidationError ? error.message : "Something went wrong. Please try again." };
  }
}

export async function runAutomationsNowAction(): Promise<AutomationActionResult> {
  const founderId = await requireFounderForAction();
  try {
    const summary = await runAutomationsAsFounder(createPostgresLeadRepositories(), createPostgresStaffRepository(), createLeadNotifier(createPostgresNotificationRepository()), { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/sales-automation");
    const total = Object.values(summary.results).reduce((n, r) => n + r.sent, 0);
    const failed = Object.values(summary.results).reduce((n, r) => n + r.failed, 0);
    return { ok: true, message: `Run finished: ${total} action${total === 1 ? "" : "s"} taken${failed > 0 ? `, ${failed} failed (they will be retried)` : ""}.` };
  } catch {
    return { ok: false, error: "The run failed. Please try again." };
  }
}
