import type { Metadata } from "next";
import { Suspense } from "react";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getFounderAttention } from "@/lib/leads/follow-up-reads";
import { requireFounder } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminBottomNav } from "@/components/admin/admin-bottom-nav";
import { ScrollToTopButton } from "@/components/admin/scroll-to-top-button";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Founder Dashboard | Developer Connects",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // The actual authorization gate. proxy.ts only confirms "signed in" —
  // this confirms "signed in AND the founder." Every /admin page and
  // Server Action either goes through this layout or, for actions,
  // calls requireFounderForAction itself — never just a hidden UI button.
  await requireFounder();

  // The Founder's attention signal: unresolved missed follow-ups and returned leads, as nav badges. Best effort —
  // a failure here must never stop the dashboard from loading.
  const badges: Record<string, number> = {};
  try {
    const user = await currentUser();
    if (user) {
      const attention = await getFounderAttention(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user.id });
      if (attention.missed > 0) badges["/admin/missed-leads"] = attention.missed;
      if (attention.returned > 0) badges["/admin/returned-leads"] = attention.returned;
    }
  } catch {
    // no badges
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        {/* Wraps on a phone: brand + avatar on the first row, the date filter on its own row beneath, so the
            header never pushes the page wider than the screen (it was ~54px too wide at 390px). From `sm` up it is
            the original single row: brand left, filter and avatar right. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:h-16 sm:gap-x-4 sm:px-6 sm:py-0">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Logo />
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">
              DC1 · Founder
            </span>
          </div>
          <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">
            <NotificationBell />
            <UserButton appearance={{ elements: { userButtonTrigger: { minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" } } }} />
          </div>
          <div className="order-3 flex w-full justify-end sm:order-2 sm:w-auto">
            {/* The ONE global analytics date filter — every date-filtered
                metric on every page below reads the exact same `?range=`
                this sets. Suspense is required here: useSearchParams()
                inside a Client Component needs a boundary, or Next.js
                opts the whole route into fully dynamic/client rendering. */}
            <Suspense fallback={<div className="h-[42px] w-32" aria-hidden="true" />}>
              <DateRangeFilter />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 pb-24 sm:px-6 lg:flex-row lg:pb-6">
        <nav className="hidden lg:block lg:w-56 lg:shrink-0" aria-label="Founder dashboard">
          <AdminNav badges={badges} />
        </nav>
        <AdminBottomNav badges={badges} />

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <ScrollToTopButton />
    </div>
  );
}
