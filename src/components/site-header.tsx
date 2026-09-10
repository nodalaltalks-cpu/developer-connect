import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Container } from "@/components/ui/container";
import { NotificationBell } from "@/components/notification-bell";

/**
 * Shared public header. Deliberately carries no admin/founder navigation
 * — that surface must never appear here, for anyone, per Phase 2D's
 * explicit rule. Signed-in users see a link to their own Profile; nothing
 * else changes based on who they are.
 *
 * `<SignedIn>`/`<SignedOut>` were removed in @clerk/nextjs Core 3 — the
 * signed-in/out branch is decided server-side via `auth()` instead.
 */
export async function SiteHeader() {
  const { userId } = await auth();

  return (
    <header className="border-b border-border">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
          Developer Connect
        </Link>
        <div className="flex items-center gap-4">
          {userId ? (
            <>
              <Link
                href="/profile"
                className="text-sm font-medium text-foreground hover:text-accent-hover"
              >
                Profile
              </Link>
              <NotificationBell />
              <UserButton />
            </>
          ) : (
            // forceRedirectUrl always lands on /post-sign-in after a
            // successful sign-in, regardless of which page this button was
            // clicked from — that page alone decides (via the existing,
            // unchanged isFounder() check) whether to continue on to
            // /admin or back to the public site. This is the one place
            // Founder auto-routing hooks in; nothing else about sign-in
            // changes.
            <SignInButton mode="modal" forceRedirectUrl="/post-sign-in">
              <button className="min-h-11 text-sm font-medium text-foreground hover:text-accent-hover">
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </Container>
    </header>
  );
}
