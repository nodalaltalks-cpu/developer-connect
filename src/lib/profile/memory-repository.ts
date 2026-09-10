import type { Profile } from "./types.ts";
import type { ProfileRepository } from "./repository.ts";

/** In-memory reference implementation for tests — not production persistence. */
export function createInMemoryProfileRepository(): ProfileRepository {
  const profiles = new Map<string, Profile>();

  return {
    async getByUserId(userId) {
      return profiles.get(userId) ?? null;
    },
    async createIfMissing(userId) {
      const existing = profiles.get(userId);
      if (existing) return existing;
      const now = new Date();
      const profile: Profile = { userId, data: {}, createdAt: now, updatedAt: now };
      profiles.set(userId, profile);
      return profile;
    },
    async updateFields(userId, patch) {
      const existing = profiles.get(userId);
      const now = new Date();
      const updated: Profile = existing
        ? { ...existing, data: { ...existing.data, ...patch }, updatedAt: now }
        : { userId, data: { ...patch }, createdAt: now, updatedAt: now };
      profiles.set(userId, updated);
      return updated;
    },
  };
}
