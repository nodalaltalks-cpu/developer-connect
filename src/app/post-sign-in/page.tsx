import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isFounder } from "@/lib/auth";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * One-time landing spot right after a successful sign-in (see
 * `forceRedirectUrl` on the `<SignInButton>` in site-header.tsx — Clerk
 * always lands here after auth completes, regardless of which public page
 * the user started from). Founder authorization is the existing, unchanged
 * `isFounder()` check — same source of truth as /admin's own gate — so
 * this page grants nothing itself; it only decides where to send someone
 * who already has (or doesn't have) that role.
 *
 * Deliberately not on the founder-only path afterward: this route only
 * fires once, at the sign-in transition, not on every page load — a
 * founder browsing the public site or their own /profile afterward is
 * never bounced back here.
 */
export default async function PostSignInPage() {
  const user = await currentUser();

  if (isFounder(user)) {
    redirect("/admin");
  }

  redirect("/");
}
