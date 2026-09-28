import type { ProfileCompletion } from "./types.ts";

/**
 * Whether a user's profile has earned the blue "Verified" tick (Part 5 of
 * the profile-UX task). Deliberately built from TWO real, existing
 * signals — never percentage alone:
 *
 *  1. `completion.missingFieldKeys.length === 0` — every configured
 *     profile field genuinely has a value, per calculateProfileCompletion
 *     (see completion.ts). Checked this way, not `percentage === 100`,
 *     so a future non-uniform field-weighting scheme can never round a
 *     99.6% profile up to a "100%" that still has missing fields.
 *  2. `emailVerified` — the account's own primary email verification
 *     status, as Clerk (the actual identity provider) already tracks it.
 *     This project has no separate "account verification" system of its
 *     own to build on; Clerk's real verification state is the existing
 *     architecture the task asks to reuse, not a new one invented here.
 *
 * Both must be true. Neither "opening the profile page" nor "clicking a
 * button" can produce this — it is a pure read of already-persisted
 * facts, recomputed on every call, never itself stored.
 */
export function isProfileVerified(
  completion: Pick<ProfileCompletion, "missingFieldKeys" | "percentage">,
  emailVerified: boolean,
): boolean {
  return emailVerified && completion.percentage !== null && completion.missingFieldKeys.length === 0;
}
