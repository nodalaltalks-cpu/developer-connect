import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { isFounder } from "./authorization.ts";

export { isFounder } from "./authorization.ts";
export type { AuthorizableUser } from "./authorization.ts";

/** The current request's signed-in user id, or null if signed out. */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Requires a signed-in user. `proxy.ts` already redirects signed-out
 * visitors away from /profile and /admin before they reach a Server
 * Component, so reaching the `redirect` below would mean that gate was
 * somehow bypassed — this is a defense-in-depth backstop, not the
 * primary control.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/");
  }
  return userId;
}

/**
 * Requires founder authorization for /admin. A signed-in non-founder
 * gets a 404, not a 403 — there is nothing to reveal to someone who
 * cannot use this area, and it matches the rule that admin navigation
 * never appears for anyone else.
 *
 * For PAGE/LAYOUT rendering only — it calls `notFound()`, which needs a
 * render boundary. Server Actions (form mutations) must use
 * `requireFounderForAction` instead; see there for why.
 */
export async function requireFounder(): Promise<void> {
  const user = await currentUser();
  if (!user || !isFounder(user)) {
    notFound();
  }
}

export class UnauthenticatedError extends Error {}

/**
 * Like `requireUserId`, but for Server Actions rather than page renders —
 * same reasoning as `requireFounderForAction` below: an action has no
 * render boundary to `redirect()` into, and a background call (e.g. the
 * notification bell's periodic unread-count refresh) should reject
 * cleanly rather than force-navigate the page out from under the user.
 */
export async function requireUserIdForAction(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthenticatedError("Sign-in required for this action.");
  }
  return userId;
}

export class UnauthorizedError extends Error {}

/**
 * The server-side authorization check every founder Server Action must
 * call FIRST, before touching the verification domain layer.
 *
 * This exists separately from `requireFounder` because a Server Action
 * is its own network-callable endpoint — Next.js exposes it independent
 * of whichever page happened to render the form that calls it. A page's
 * `requireFounder()` check only runs when that page renders; it does
 * nothing to stop the action itself from being invoked directly. Relying
 * on the UI not showing an Approve button to a non-founder is exactly
 * the "hiding it in the UI" mistake Phase 2D explicitly rules out —
 * every mutation must check authorization itself.
 *
 * Throws (rather than calling `notFound()`) because an action has no
 * render boundary to resolve into.
 */
export async function requireFounderForAction(): Promise<string> {
  const user = await currentUser();
  if (!user || !isFounder(user)) {
    throw new UnauthorizedError("Founder authorization required for this action.");
  }
  return user.id;
}
