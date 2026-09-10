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

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
