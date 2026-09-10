import type { ProfileRepository } from "./repository.ts";
import { calculateProfileCompletion } from "./completion.ts";
import type { Profile, ProfileCompletion } from "./types.ts";
import { safeRecordAnalyticsEvent } from "../developer-connect/events.ts";
import type { AnalyticsEventSink, DeviceType } from "../developer-connect/events.ts";

export interface ProfileWithCompletion {
  profile: Profile;
  completion: ProfileCompletion;
}

export interface AnalyticsContext {
  sink: AnalyticsEventSink;
  sessionId: string;
  deviceType?: DeviceType;
}

/** Fetches (creating if needed) a user's profile. Fires profile_started exactly once, the first time the row is created. */
export async function getOrCreateProfile(
  repo: ProfileRepository,
  userId: string,
  analytics: AnalyticsContext,
): Promise<ProfileWithCompletion> {
  const existing = await repo.getByUserId(userId);
  const profile = existing ?? (await repo.createIfMissing(userId));

  if (!existing) {
    await safeRecordAnalyticsEvent(analytics.sink, {
      eventName: "profile_started",
      occurredAt: new Date(),
      sessionId: analytics.sessionId,
      deviceType: analytics.deviceType,
      userId,
    });
  }

  return { profile, completion: calculateProfileCompletion(profile.data) };
}

/**
 * Merges `patch` into the user's profile — a partial update, never a full
 * overwrite. Fires profile_updated always, profile_field_completed for
 * each field that newly became filled, and profile_completion_reached if
 * completion crossed into a new band. The latter two are inert (never
 * fire) while PROFILE_FIELD_CONFIG is empty, since nothing can "complete"
 * yet — that's expected, not a bug.
 */
export async function updateProfileFields(
  repo: ProfileRepository,
  userId: string,
  patch: Record<string, unknown>,
  analytics: AnalyticsContext,
): Promise<ProfileWithCompletion> {
  const before = await repo.getByUserId(userId);
  const beforeCompletion = calculateProfileCompletion(before?.data ?? {});

  const updated = await repo.updateFields(userId, patch);
  const completion = calculateProfileCompletion(updated.data);

  await safeRecordAnalyticsEvent(analytics.sink, {
    eventName: "profile_updated",
    occurredAt: new Date(),
    sessionId: analytics.sessionId,
    deviceType: analytics.deviceType,
    userId,
  });

  for (const key of Object.keys(patch)) {
    const wasFilled = beforeCompletion.completedFieldKeys.includes(key);
    const isFilledNow = completion.completedFieldKeys.includes(key);
    if (!wasFilled && isFilledNow) {
      await safeRecordAnalyticsEvent(analytics.sink, {
        eventName: "profile_field_completed",
        occurredAt: new Date(),
        sessionId: analytics.sessionId,
        deviceType: analytics.deviceType,
        userId,
        fieldKey: key,
      });
    }
  }

  if (completion.band && beforeCompletion.band !== completion.band) {
    await safeRecordAnalyticsEvent(analytics.sink, {
      eventName: "profile_completion_reached",
      occurredAt: new Date(),
      sessionId: analytics.sessionId,
      deviceType: analytics.deviceType,
      userId,
      band: completion.band,
      percentage: completion.percentage ?? 0,
    });
  }

  return { profile: updated, completion };
}
