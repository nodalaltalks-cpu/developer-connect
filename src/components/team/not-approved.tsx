import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Shown at /team to someone who signed in (for example with Google) but is not an approved, active employee. It says the
 * same thing whether they were never invited, are still waiting for approval, were switched off, or have left, and it
 * reveals nothing about the team. Signing in only proves who they are; the Founder decides who works here.
 */
export function NotApproved() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      <Logo />
      <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">Your account is not approved for team access</h1>
      <p className="mt-3 max-w-sm text-base leading-7 text-muted-foreground">
        Your Google account is not approved for Developer Connects access. Please contact the Founder.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Back to Developer Connects
        </Link>
        <SignOutButton redirectUrl="/">
          <button type="button" className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-4 text-base font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
