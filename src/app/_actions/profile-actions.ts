"use server";

import { revalidatePath } from "next/cache";
import { requireUserIdForAction } from "@/lib/auth";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import { updateProfileFields } from "@/lib/profile/profile-service";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { maybeNotifyProfileCompletion } from "@/lib/notifications/profile-completion-notifier";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { getOrCreateSessionId, getDeviceType } from "@/lib/session";
import type { ProfileCompletion } from "@/lib/profile/types";

/**
 * The ONLY way profile fields get saved from the browser. Always uses the
 * server's own authenticated user id (`requireUserIdForAction`) — a
 * userId can never be supplied by the caller, so this can never write to
 * anyone else's profile. Orchestrates two already-independent, already-
 * tested pieces (updateProfileFields, maybeNotifyProfileCompletion)
 * rather than merging their logic — see profile-completion-notifier.ts
 * for why that stays a separate module.
 */
export async function saveProfileFieldsAction(
  patch: Record<string, unknown>,
): Promise<{ completion: ProfileCompletion }> {
  const userId = await requireUserIdForAction();
  const profileRepo = createPostgresProfileRepository();
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();

  const { profile, completion } = await updateProfileFields(profileRepo, userId, patch, {
    sink: postgresAnalyticsSink,
    sessionId,
    deviceType,
  });

  const notificationRepo = createPostgresNotificationRepository();
  await maybeNotifyProfileCompletion(notificationRepo, userId, completion, profile.data);

  revalidatePath("/profile");
  return { completion };
}
