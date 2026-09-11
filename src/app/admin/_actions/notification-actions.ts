"use server";

import { requireFounderForAction } from "@/lib/auth";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import {
  resolveFounderAudience,
  sendFounderNotification,
  composeFounderMessage,
  type FounderAudience,
  type FounderMessageInput,
} from "@/lib/notifications/founder-notification-service";
import type { Notification } from "@/lib/notifications/types";

/**
 * Founder-only notification management (Phase 4B). Every exported
 * function here calls requireFounderForAction() FIRST — the same guard
 * every other founder-only Server Action in this project uses (see
 * admin/_actions/developer-actions.ts, candidate-actions.ts,
 * verification-actions.ts). This is never enforced only by hiding the UI.
 */

export interface PreviewNotificationResult {
  recipientCount: number;
  /** A real, composed example from the first matching recipient — never a fabricated sample. Null when there are zero recipients or nothing composes (e.g. everyone already at 100%). */
  sample: { recipientName: string; title: string; body: string; targetRoute: string | null } | null;
}

export async function previewFounderNotificationAction(
  audience: FounderAudience,
  message: FounderMessageInput,
): Promise<PreviewNotificationResult> {
  await requireFounderForAction();
  const profileRepo = createPostgresProfileRepository();

  const recipients = await resolveFounderAudience(profileRepo, audience);
  if (recipients.length === 0) {
    return { recipientCount: 0, sample: null };
  }

  const composedForFirst = recipients
    .map((r) => ({ recipient: r, composed: composeFounderMessage(r, message) }))
    .find((entry) => entry.composed !== null);

  return {
    recipientCount: recipients.length,
    sample: composedForFirst
      ? {
          recipientName: composedForFirst.recipient.displayName,
          title: composedForFirst.composed!.title,
          body: composedForFirst.composed!.body,
          targetRoute: composedForFirst.composed!.targetRoute,
        }
      : null,
  };
}

export interface SendNotificationActionResult {
  ok: boolean;
  error?: string;
  recipientCount?: number;
  sentCount?: number;
  skippedDuplicateCount?: number;
}

export async function sendFounderNotificationAction(
  audience: FounderAudience,
  message: FounderMessageInput,
): Promise<SendNotificationActionResult> {
  await requireFounderForAction();
  const profileRepo = createPostgresProfileRepository();
  const notificationRepo = createPostgresNotificationRepository();

  const recipients = await resolveFounderAudience(profileRepo, audience);
  if (recipients.length === 0) {
    return { ok: false, error: "No users match this audience." };
  }

  const result = await sendFounderNotification(notificationRepo, recipients, message);
  return {
    ok: true,
    recipientCount: result.recipientCount,
    sentCount: result.sentCount,
    skippedDuplicateCount: result.skippedDuplicateCount,
  };
}

export async function listFounderNotificationHistoryAction(limit = 50): Promise<Notification[]> {
  await requireFounderForAction();
  const notificationRepo = createPostgresNotificationRepository();
  return notificationRepo.listByType("FOUNDER_MESSAGE", limit);
}
