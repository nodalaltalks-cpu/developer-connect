"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { getClerkUser } from "@/lib/admin-analytics/clerk-users";
import {
  changeContactStatus,
  getContactHistory,
  moveContactToTrash,
  restoreContactFromTrash,
  permanentlyDeleteContact,
} from "@/lib/engagement/contact-service";
import type { ContactStatus, ContactSubmission, ContactStatusHistoryEntry } from "@/lib/engagement/types";

/**
 * Founder-only Contact case-management actions. Every function calls
 * requireFounderForAction FIRST — same pattern as every other admin
 * Server Action in this codebase (verification-actions.ts,
 * developer-actions.ts, engagement-actions.ts) — so a hidden button is
 * never the only thing standing between a non-founder and a mutation.
 */

const AUTH_ERROR = "You don't have permission to do that. Founder access is required.";

export interface ContactHistoryEntryView extends ContactStatusHistoryEntry {
  /** Resolved via the existing Clerk lookup — never a hardcoded name (Part 10). "System" for actorType SYSTEM, the raw Clerk id as a last-resort fallback if the lookup fails. */
  actorDisplayName: string;
}

/** De-duplicated Clerk lookups: most history lists are one Founder acting repeatedly, so this is at most one real API call per distinct actor, not one per entry. */
async function enrichHistory(history: ContactStatusHistoryEntry[]): Promise<ContactHistoryEntryView[]> {
  const uniqueActorIds = [...new Set(history.filter((h) => h.actorType !== "SYSTEM").map((h) => h.actorId))];
  const resolved = await Promise.all(uniqueActorIds.map((id) => getClerkUser(id)));
  const nameById = new Map(uniqueActorIds.map((id, i) => [id, resolved[i]?.displayName ?? id]));

  return history.map((entry) => ({
    ...entry,
    actorDisplayName: entry.actorType === "SYSTEM" ? "System" : (nameById.get(entry.actorId) ?? entry.actorId),
  }));
}

export interface ChangeContactStatusResult {
  ok: boolean;
  error?: string;
  submission?: ContactSubmission;
  history?: ContactHistoryEntryView[];
  /** True only when this call actually changed something — lets the UI show a precise confirmation instead of a generic one. */
  changed?: boolean;
  notificationSent?: boolean;
}

export async function changeContactStatusAction(
  id: string,
  status: ContactStatus,
  note?: string,
): Promise<ChangeContactStatusResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  const notifications = createPostgresNotificationRepository();

  try {
    const result = await changeContactStatus(engagement, notifications, id, status, note, {
      actorType: "FOUNDER",
      actorId: founderId,
    });
    const history = await enrichHistory(await getContactHistory(engagement, id));
    revalidatePath("/admin/contact");
    return {
      ok: true,
      submission: result.submission,
      history,
      changed: result.historyEntry !== null,
      notificationSent: result.notificationSent,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update this request." };
  }
}

export interface ContactHistoryResult {
  ok: boolean;
  error?: string;
  history?: ContactHistoryEntryView[];
}

/** Lazily loaded the moment a Founder expands a submission — same "don't pay for what isn't open" reasoning as getCandidateReviewDataAction. */
export async function getContactHistoryAction(id: string): Promise<ContactHistoryResult> {
  try {
    await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  const history = await enrichHistory(await getContactHistory(engagement, id));
  return { ok: true, history };
}

export interface TrashActionResult {
  ok: boolean;
  error?: string;
  submission?: ContactSubmission;
}

export async function moveContactToTrashAction(id: string): Promise<TrashActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  try {
    const submission = await moveContactToTrash(engagement, id, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/contact");
    revalidatePath("/admin/contact/trash");
    return { ok: true, submission };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not move this request to Trash." };
  }
}

export async function restoreContactAction(id: string): Promise<TrashActionResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  try {
    const submission = await restoreContactFromTrash(engagement, id, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/contact");
    revalidatePath("/admin/contact/trash");
    return { ok: true, submission };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not restore this request." };
  }
}

export interface PermanentDeleteResult {
  ok: boolean;
  error?: string;
}

/**
 * The one irreversible action in this whole feature. Founder authorization
 * is enforced here, server-side, exactly the same way as every other
 * mutation — the UI's confirmation dialog is a courtesy to the Founder,
 * never the actual security boundary (Part 39: never trust hidden
 * buttons, client-side role checks, or route visibility).
 */
export async function permanentlyDeleteContactAction(id: string): Promise<PermanentDeleteResult> {
  let founderId: string;
  try {
    founderId = await requireFounderForAction();
  } catch {
    return { ok: false, error: AUTH_ERROR };
  }

  const engagement = createEngagementRepositories();
  try {
    await permanentlyDeleteContact(engagement, id, { actorType: "FOUNDER", actorId: founderId });
    revalidatePath("/admin/contact/trash");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not permanently delete this request." };
  }
}
