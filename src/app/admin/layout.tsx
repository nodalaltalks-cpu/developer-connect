import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { requireFounder } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { ScrollToTopButton } from "@/components/admin/scroll-to-top-button";

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

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Developer Connects
            </span>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">
              Founder
            </span>
          </div>
          <UserButton />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
        <nav className="lg:w-56 lg:shrink-0" aria-label="Founder dashboard">
          <AdminNav />
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <ScrollToTopButton />
    </div>
  );
}
