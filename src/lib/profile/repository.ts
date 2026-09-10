import type { Profile } from "./types.ts";

export interface ProfileRepository {
  getByUserId(userId: string): Promise<Profile | null>;
  /** Batch lookup for admin views that need several users' profiles at once — avoids one query per user. Missing ids are simply absent from the result, never an error. */
  getManyByUserIds(userIds: string[]): Promise<Profile[]>;
  /** Creates an empty profile shell if one doesn't exist yet; otherwise returns the existing one untouched. */
  createIfMissing(userId: string): Promise<Profile>;
  /**
   * Merges `patch` into the existing profile's data (creating the profile
   * first if needed). Keys not present in `patch` are left exactly as
   * they were — this is what makes "update one field" safe without
   * resending the whole profile.
   */
  updateFields(userId: string, patch: Record<string, unknown>): Promise<Profile>;
}
