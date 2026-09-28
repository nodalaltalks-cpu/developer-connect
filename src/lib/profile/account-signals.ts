import type { User } from "@clerk/nextjs/server";

/**
 * Reads the one real, already-existing account-verification fact this
 * project has: Clerk's own verification status for the account's primary
 * email address. Kept as its own tiny function (rather than inlined at
 * every call site) so `isProfileVerified` (verification.ts) stays a pure,
 * Clerk-agnostic function that only ever takes a plain boolean — nothing
 * downstream needs to know or care that Clerk is the identity provider.
 */
export function isPrimaryEmailVerified(user: User | null): boolean {
  return user?.primaryEmailAddress?.verification?.status === "verified";
}
