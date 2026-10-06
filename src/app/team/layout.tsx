import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notification-bell";
import { requireEmployee } from "@/lib/team/session";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "My Leads | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, per-user data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeamLayout({ children }: LayoutProps<"/team">) {
  // The actual authorization gate. proxy.ts only confirms "signed in" — this confirms "signed in AND an active team
  // member". Anyone else (signed-out, unknown, deactivated, the Founder) gets a 404. Every /team page and Server
  // Action also checks for itself; a layout is not re-run on every client navigation.
  const { member } = await requireEmployee();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Logo />
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">Team</span>
          </div>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{member.displayName}</span>
          <NotificationBell />
          <UserButton />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <nav aria-label="Team workspace" className="mb-4 flex gap-4">
          <Link href="/team" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
            My Leads
          </Link>
          <Link href="/team/missed" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
            Missed follow-ups
          </Link>
          <Link href="/team/calls" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
            My calls
          </Link>
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
