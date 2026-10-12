"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createVideo, deleteVideo, updateVideo } from "@/lib/social/db/postgres-social";
import { validateVideoInput } from "@/lib/social/video-input";

/**
 * Founder-only: add, show/hide and remove the landing-page videos. Each action authorizes the Founder as its very first statement
 * (a Server Action is its own network-callable endpoint). The browser sends only the fields below; ids and times are the server's.
 */

export type SocialActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "Something went wrong. Please try again.";

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin/social");
  revalidatePath("/admin/social/videos");
}

export async function addVideoAction(raw: Record<string, unknown>): Promise<SocialActionResult> {
  await requireFounderForAction();
  const checked = validateVideoInput(raw ?? {});
  if (!checked.ok) return { ok: false, error: checked.message };
  try {
    await createVideo(checked.value, new Date());
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC };
  }
}

export async function setVideoActiveAction(id: string, active: boolean): Promise<SocialActionResult> {
  await requireFounderForAction();
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That video could not be found." };
  try {
    await updateVideo(id, { active: active === true }, new Date());
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC };
  }
}

export async function setVideoOrderAction(id: string, sortOrder: number): Promise<SocialActionResult> {
  await requireFounderForAction();
  if (typeof id !== "string" || !UUID.test(id) || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return { ok: false, error: "That video could not be found." };
  try {
    await updateVideo(id, { sortOrder }, new Date());
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC };
  }
}

export async function deleteVideoAction(id: string): Promise<SocialActionResult> {
  await requireFounderForAction();
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That video could not be found." };
  try {
    await deleteVideo(id);
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC };
  }
}
