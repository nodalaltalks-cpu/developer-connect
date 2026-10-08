"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getActiveHref, NAV_ITEMS } from "@/components/admin/admin-nav";
import { BottomSheet } from "@/components/ui/bottom-sheet";

/**
 * Phone navigation for the Founder (below `lg`; the sidebar takes over from there). Four everyday destinations sit in a
 * thumb-reach bar, and "More" opens a sheet with every other section - so 33 links no longer sit in a sideways-scrolling
 * strip. The bar respects the home-indicator safe area, and Back closes the sheet (see BottomSheet).
 */
const PRIMARY = [
  { href: "/admin/command-centre", label: "Attention" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/staff", label: "Team" },
  { href: "/admin/finance", label: "Finance" },
];

export function AdminBottomNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const active = getActiveHref(pathname);
  const primaryHrefs = PRIMARY.map((p) => p.href);
  const inMore = active !== null && !primaryHrefs.includes(active);
  const moreBadge = Object.entries(badges).reduce((sum, [href, n]) => sum + (primaryHrefs.includes(href) ? 0 : n), 0);
  const item = "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <>
      <nav aria-label="Founder quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {PRIMARY.map((p) => {
            const on = pathname === p.href || pathname.startsWith(`${p.href}/`);
            return (
              <li key={p.href} className="flex flex-1">
                <Link href={p.href} aria-current={on ? "page" : undefined} className={`${item} ${on ? "text-accent-hover" : "text-muted-foreground"}`}>
                  <span aria-hidden="true" className={`h-1 w-6 rounded-full ${on ? "bg-accent" : "bg-transparent"}`} />
                  {p.label}
                  {badges[p.href] ? <span className="absolute right-3 top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{badges[p.href]}</span> : null}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={`${item} ${inMore ? "text-accent-hover" : "text-muted-foreground"}`}>
              <span aria-hidden="true" className={`h-1 w-6 rounded-full ${inMore ? "bg-accent" : "bg-transparent"}`} />
              More
              {moreBadge > 0 ? <span className="absolute right-3 top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{moreBadge}</span> : null}
            </button>
          </li>
        </ul>
      </nav>
      <BottomSheet open={more} onClose={() => setMore(false)} title="All sections">
        <ul className="grid grid-cols-1 gap-1" onClick={() => setMore(false)}>
          {NAV_ITEMS.map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={n.href === active ? "page" : undefined} className={`flex min-h-12 items-center justify-between rounded-md px-3 text-base ${n.href === active ? "bg-accent-soft font-medium text-accent-hover" : "text-foreground hover:bg-muted"}`}>
                {n.label}
                {badges[n.href] ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{badges[n.href]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
