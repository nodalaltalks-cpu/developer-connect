"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { UUID, validatePostInput, validatePublicReplies } from "@/lib/social-automation/input";
import {
  createPost,
  deletePost,
  revokePriceApproval,
  saveSettings,
  setFollowUp,
  setPostMode,
  updatePost,
  verifyAvailability,
  verifyPrice,
} from "@/lib/social-automation/db/postgres-automation";
import { LIVE_CONFIRMATION, MODES } from "@/lib/social-automation/types";
import type { AutomationMode, AutomationSettings } from "@/lib/social-automation/types";

/**
 * Founder-only controls for comment-to-DM automation. Each action authorizes the Founder as its first statement (a Server
 * Action is its own network-callable endpoint). The browser sends only text and ids; the actor and every time are the server's.
 * Nothing here contacts Instagram or Facebook: these actions only change configuration.
 */

export type AutomationActionResult = { ok: true; id?: string } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";
const NOT_FOUND = "That post could not be found.";

function refresh(id?: string) {
  revalidatePath("/admin/social-automation");
  if (id) revalidatePath(`/admin/social-automation/${id}`);
}

const isId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

async function guarded<T extends AutomationActionResult>(job: (actor: string) => Promise<T>): Promise<AutomationActionResult> {
  const actor = await requireFounderForAction();
  try {
    return await job(actor);
  } catch {
    return { ok: false, error: GENERIC };
  }
}

export async function savePostAction(id: string | null, raw: Record<string, unknown>): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    if (id !== null && !isId(id)) return { ok: false, error: NOT_FOUND };
    const checked = validatePostInput(raw ?? {});
    if (!checked.ok) return { ok: false, error: checked.message };
    const now = new Date();
    if (id === null) {
      const created = await createPost(checked.value, actor, now);
      if (created.ok) refresh();
      return created;
    }
    const result = await updatePost(id, checked.value, actor, now);
    if (result.ok) refresh(id);
    return result.ok ? { ok: true, id } : result;
  });
}

export async function setPostModeAction(id: string, mode: AutomationMode, confirmation?: string): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    if (!isId(id)) return { ok: false, error: NOT_FOUND };
    if (!(MODES as readonly string[]).includes(mode)) return { ok: false, error: "Choose Disabled, Dry run or Live." };
    // Live is never one click: the Founder must type the phrase, so it cannot be set by an accidental tap or a stray request.
    if (mode === "LIVE" && confirmation !== LIVE_CONFIRMATION) return { ok: false, error: `Type ${LIVE_CONFIRMATION} to confirm.` };
    const result = await setPostMode(id, mode, actor, new Date());
    if (result.ok) refresh(id);
    return result;
  });
}

export async function verifyPriceAction(id: string): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    if (!isId(id)) return { ok: false, error: NOT_FOUND };
    const result = await verifyPrice(id, actor, new Date());
    if (result.ok) refresh(id);
    return result;
  });
}

export async function revokePriceAction(id: string): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    if (!isId(id)) return { ok: false, error: NOT_FOUND };
    await revokePriceApproval(id, actor, new Date());
    refresh(id);
    return { ok: true };
  });
}

export async function verifyAvailabilityAction(id: string): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    if (!isId(id)) return { ok: false, error: NOT_FOUND };
    const result = await verifyAvailability(id, actor, new Date());
    if (result.ok) refresh(id);
    return result;
  });
}

export async function deletePostAction(id: string): Promise<AutomationActionResult> {
  return guarded(async () => {
    if (!isId(id)) return { ok: false, error: NOT_FOUND };
    // Comment history is kept (its link to the post is cleared by the database), so deleting a configuration loses no record.
    const result = await deletePost(id);
    if (result.ok) refresh();
    return result;
  });
}

export async function saveSettingsAction(raw: {
  enabled?: unknown;
  priceMaxAgeDays?: unknown;
  availabilityMaxAgeDays?: unknown;
  defaultPublicReply?: unknown;
  defaultPublicReplyFallback?: unknown;
}): Promise<AutomationActionResult> {
  return guarded(async (actor) => {
    const patch: Partial<AutomationSettings> = {};
    if (raw?.enabled !== undefined) {
      if (typeof raw.enabled !== "boolean") return { ok: false, error: "Invalid setting." };
      patch.enabled = raw.enabled;
    }
    for (const key of ["priceMaxAgeDays", "availabilityMaxAgeDays"] as const) {
      const value = raw?.[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 365) return { ok: false, error: "Days must be a whole number from 1 to 365." };
      patch[key] = value;
    }
    // The common public replies: the same rules as a post's own (no placeholders; the not-sent one must not claim a DM).
    if (raw?.defaultPublicReply !== undefined || raw?.defaultPublicReplyFallback !== undefined) {
      const clean = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === "string" && v.trim().length <= 300 ? v.trim() || null : undefined);
      const sent = clean(raw.defaultPublicReply);
      const notSent = clean(raw.defaultPublicReplyFallback);
      if (sent === undefined || notSent === undefined) return { ok: false, error: "Public replies are limited to 300 characters." };
      const problem = validatePublicReplies(sent, notSent);
      if (problem) return { ok: false, error: problem };
      patch.defaultPublicReply = sent;
      patch.defaultPublicReplyFallback = notSent;
    }
    await saveSettings(patch, actor, new Date());
    refresh();
    return { ok: true };
  });
}

export async function setFollowUpAction(eventId: string, status: string, note?: string): Promise<AutomationActionResult> {
  return guarded(async () => {
    if (!isId(eventId)) return { ok: false, error: "That enquiry could not be found." };
    if (status !== "OPEN" && status !== "DONE" && status !== "DISMISSED") return { ok: false, error: "Invalid status." };
    const cleaned = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;
    const result = await setFollowUp(eventId, status, cleaned, new Date());
    if (result.ok) refresh();
    return result;
  });
}
