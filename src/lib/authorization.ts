/**
 * Pure, framework-agnostic authorization logic — deliberately has zero
 * imports from Clerk or Next.js, so it can be unit-tested directly.
 * (Clerk's package ships internal relative imports without file
 * extensions, which Next's bundler resolves fine but Node's strict ESM
 * loader cannot — importing @clerk/nextjs/server from a plain `node
 * --test` process fails outright. Keeping this logic Clerk-free avoids
 * that entirely rather than working around it.)
 *
 * auth.ts wraps this with the actual Clerk calls for real use in the app.
 */

/**
 * Minimal shape this module actually reads from a Clerk user — kept
 * narrow so `isFounder` is testable with a plain object, no Clerk SDK or
 * live session required.
 */
export interface AuthorizableUser {
  privateMetadata: Record<string, unknown>;
}

/**
 * Founder authorization is exactly one flag, checked server-side only:
 * `privateMetadata.role === "founder"`. `privateMetadata` is never sent
 * to the client by Clerk, so this can't be read or spoofed from the
 * browser. Not every authenticated user is a founder — this must be set
 * explicitly (via the Clerk dashboard or Backend API) for one specific
 * account; nothing in this codebase grants it automatically.
 */
export function isFounder(user: AuthorizableUser | null | undefined): boolean {
  return user?.privateMetadata?.role === "founder";
}
