"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";
import type { ContactSubmission } from "@/lib/engagement/types";

type TrashResult = { submissions: ContactSubmission[] };
type UnlockResult = ({ ok: true; token: string } & TrashResult) | { ok: false; reason: "wrong-password" | "not-configured" };

// How long one password entry keeps range-filter refreshes working. The
// token lives only in the open Trash view's memory, so leaving the page
// and coming back always asks for the password again.
const TOKEN_TTL_MS = 30 * 60 * 1000;

function sign(userId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${userId}.${expiresAt}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Gates the Trash data fetch behind a Founder-only password, checked on the
 * server so Trash's contents never reach the browser before it is correct.
 * The password comes from the TRASH_PASSWORD env var (never hardcoded — this
 * repo is committed); if it is unset the gate fails closed.
 *
 * On success it also returns a short-lived HMAC token bound to this Founder,
 * which `getTrashForRangeAction` requires — so changing the date filter
 * doesn't re-prompt, but that action can't be called without having passed
 * the password first.
 */
export async function unlockTrashAction(password: string, rangeKey?: string): Promise<UnlockResult> {
  const userId = await requireFounderForAction();

  const secret = process.env.TRASH_PASSWORD;
  if (!secret) return { ok: false, reason: "not-configured" };
  if (typeof password !== "string" || !safeEqual(password, secret)) {
    return { ok: false, reason: "wrong-password" };
  }

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const token = `${expiresAt}.${sign(userId, expiresAt, secret)}`;

  const range = resolveDateRange(parseDateRangeKey(rangeKey));
  const submissions = await createEngagementRepositories().contact.listTrash(200, range);
  return { ok: true, token, submissions };
}

/**
 * Re-fetches Trash for a different date range without asking for the
 * password again. Requires the token issued by `unlockTrashAction` (valid,
 * unexpired, and issued to this same Founder); a Founder session alone is
 * not enough.
 */
export async function getTrashForRangeAction(token: string, rangeKey?: string): Promise<TrashResult> {
  const userId = await requireFounderForAction();

  const secret = process.env.TRASH_PASSWORD;
  const [expiresRaw, mac] = typeof token === "string" ? token.split(".") : [];
  const expiresAt = Number(expiresRaw);
  if (!secret || !mac || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    throw new Error("Trash session expired.");
  }
  if (!safeEqual(mac, sign(userId, expiresAt, secret))) {
    throw new Error("Trash session invalid.");
  }

  const range = resolveDateRange(parseDateRangeKey(rangeKey));
  const submissions = await createEngagementRepositories().contact.listTrash(200, range);
  return { submissions };
}
