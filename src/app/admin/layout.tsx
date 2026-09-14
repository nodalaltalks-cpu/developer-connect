import Link from "next/link";
import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { requireFounder } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Founder Dashboard | Developer Connects",
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/platform-health", label: "Platform Health" },
  { href: "/admin/developers", label: "Developers" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/search", label: "Search Intelligence" },
  { href: "/admin/users", label: "Users & Profiles" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/contact", label: "Contact" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/data-quality", label: "Data Quality" },
  { href: "/admin/automation", label: "Automation" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/ai-readiness", label: "AI/ML Readiness" },
  { href: "/admin/learning", label: "Learning" },
];

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
          <ul className="flex gap-1 overflow-x-auto pb-2 text-sm lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} className="shrink-0 lg:shrink">
                <Link
                  href={item.href}
                  className="block min-h-11 whitespace-nowrap rounded-md px-3 py-2.5 leading-6 text-foreground hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
