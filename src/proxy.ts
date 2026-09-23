import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Base authentication gate for /profile and /admin: any signed-out
 * visitor is redirected to sign in before reaching either. This is only
 * "signed in" — it does NOT establish founder authorization. The founder
 * check (src/lib/auth.ts's requireFounder) runs separately, inside the
 * /admin layout itself, because knowing someone is logged in tells you
 * nothing about whether they're the founder.
 *
 * Everything else — the homepage, developer pages, search — is
 * intentionally untouched: public discovery must keep working with zero
 * authentication.
 */
const isProtectedRoute = createRouteMatcher(["/profile(.*)", "/admin(.*)"]);
const isAuthFlowRoute = createRouteMatcher(["/post-sign-in(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

/** Any Clerk cookie (dev-browser, session, client_uat, incl. suffixed variants) or Clerk query param. */
const CLERK_COOKIE = /^__(clerk|session|client_uat)/;

function carriesClerkState(req: NextRequest): boolean {
  if (req.cookies.getAll().some((cookie) => CLERK_COOKIE.test(cookie.name))) return true;
  for (const key of req.nextUrl.searchParams.keys()) {
    if (key.startsWith("__clerk")) return true;
  }
  return false;
}

/**
 * TEMPORARY crawler fix while production still runs on a Clerk
 * DEVELOPMENT instance. A development instance redirects every
 * cookie-less page load (sec-fetch-dest: document / Accept: text/html)
 * to its dev-browser handshake, and its loop guard is itself a cookie —
 * so a crawler that never keeps cookies (Googlebot) loops forever and
 * public pages are never indexed.
 *
 * For a GET to a PUBLIC route that carries no Clerk cookies at all,
 * Clerk is shown the request as a non-document fetch, so it resolves to
 * "signed out" (200, page rendered) instead of starting a handshake.
 * auth() still works for those pages because clerkMiddleware still runs.
 * Protected routes, the post-sign-in flow, and anyone who already has
 * Clerk cookies go through Clerk completely unchanged. A Clerk
 * PRODUCTION instance never handshakes a cookie-less request, so once
 * production keys are in place this branch becomes a no-op and can be
 * removed.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (
    req.method === "GET" &&
    !isProtectedRoute(req) &&
    !isAuthFlowRoute(req) &&
    !carriesClerkState(req)
  ) {
    const headers = new Headers(req.headers);
    headers.set("sec-fetch-dest", "empty");
    headers.set("accept", "*/*");
    return clerk(new NextRequest(req, { headers }), event);
  }
  return clerk(req, event);
}

export const config = {
  matcher: [
    // .txt/.xml are excluded so /robots.txt and /sitemap.xml (no auth needed) never pass through Clerk.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
    "/(api|trpc)(.*)",
  ],
};
