import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notification-bell";
import { DeviceCallSync } from "@/components/team/device-call-sync";
import { FollowUpAlerts } from "@/components/team/follow-up-alerts";
import { MissedLock } from "@/components/team/missed-lock";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getMyWorkState } from "@/lib/leads/follow-up-reads";
import { formatOverdue } from "@/lib/leads/format";
import { notFound } from "next/navigation";
import { isFounder } from "@/lib/authorization";
import { currentUser } from "@/lib/auth";
import { TeamNav } from "@/components/team/team-nav";
import { NotApproved } from "@/components/team/not-approved";
import { getTeamAccess } from "@/lib/team/session";
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
  const access = await getTeamAccess(isFounder);
  if (access.kind === "hidden") notFound();
  // Signed in with Google but not an approved, active employee: a friendly, uninformative message and no workspace.
  if (access.kind === "not-approved") return <NotApproved />;
  const { member, actor } = access.session;
  // The lock and the alerts need to know what is missed, on every team page.
  const work = await getMyWorkState(createPostgresLeadRepositories(), actor).catch(() => null);
  const missed = (work?.missed ?? []).map((item) => ({ leadId: item.lead.id, name: item.lead.name, overdue: formatOverdue(item.overdueMs) }));
  // The Founder can also work as a team member: give them the way back to the Founder dashboard.
  const founderView = isFounder(await currentUser());

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Logo />
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">{member.employeeId}</span>
          </div>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{member.employeeId} · {member.displayName}</span>
          {founderView && (
            <Link href="/admin" className="inline-flex min-h-11 items-center text-xs font-medium text-accent-hover hover:underline sm:hidden">
              Founder
            </Link>
          )}
          <NotificationBell />
          <UserButton appearance={{ elements: { userButtonTrigger: { minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" } } }} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:pb-6">
        <DeviceCallSync />
        <TeamNav founder={founderView} />
        <FollowUpAlerts />
        <MissedLock missed={missed} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
