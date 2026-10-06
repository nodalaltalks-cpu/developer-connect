import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileHeaderLink } from "@/components/profile-header-link";
import { AccountMenu } from "@/components/account-menu";
import { isFounder } from "@/lib/auth";
import { isPrimaryEmailVerified } from "@/lib/profile/account-signals";
import { isProfileVerified } from "@/lib/profile/verification";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import { calculateProfileCompletion } from "@/lib/profile/completion";

/**
 * Shared public header. Signed-in users see a link to their own Profile;
 * the founder additionally sees a Dashboard link to /admin.
 *
 * The Dashboard link is decided on every render by the same server-side
 * isFounder() check /admin itself uses (privateMetadata, never sent to
 * the browser) — not only at sign-in via /post-sign-in, which runs once.
 * Without it, a founder returning via a bookmark had a live session but
 * no route back to /admin short of signing out and in again. The link is
 * navigation only: /admin stays gated by proxy.ts + requireFounder().
 *
 * `<SignedIn>`/`<SignedOut>` were removed in @clerk/nextjs Core 3 — the
 * signed-in/out branch is decided server-side via `auth()` instead.
 */
export async function SiteHeader() {
  const { userId } = await auth();
  // currentUser() is only fetched for signed-in visitors, and only once —
  // isFounder() and isPrimaryEmailVerified() both read from this same
  // object rather than each fetching their own copy.
  const user = userId ? await currentUser() : null;
  const showDashboard = isFounder(user);

  // Read-only — never getOrCreateProfile, which would create a profile
  // row and fire a profile_started analytics event just from loading a
  // page that happens to render the header. A profile is only actually
  // created the moment someone visits /profile itself.
  const completion = userId
    ? calculateProfileCompletion(
        (await createPostgresProfileRepository().getByUserId(userId))?.data ?? {},
      )
    : null;
  const verified = completion ? isProfileVerified(completion, isPrimaryEmailVerified(user)) : false;

  return (
    <header className="border-b border-border">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/buy-direct-from-developer"
            className="hidden text-sm font-medium text-foreground hover:text-accent-hover sm:inline"
          >
            Guides
          </Link>
          {userId ? (
            <>
              {showDashboard && (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-foreground hover:text-accent-hover"
                >
                  Dashboard
                </Link>
              )}
              {completion && <ProfileHeaderLink completion={completion} verified={verified} />}
              <NotificationBell />
              <AccountMenu profilePercentage={completion?.percentage ?? null} verified={verified} />
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
