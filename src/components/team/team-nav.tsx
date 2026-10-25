"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FounderMoreSheet } from "@/components/admin/founder-more-sheet";
import { ALL_TABS, DEFAULT_TAB_KEYS } from "@/lib/staff/tab-access";

/**
 * The employee's navigation. On a phone it is a bottom bar in thumb reach (home-indicator safe area respected); from
 * `sm` up the same links sit in a row under the header. Five destinations, the same five on every screen size.
 */
// How a tab recognises its own pages (some tabs own more than one route).
const MATCH: Record<string, (p: string) => boolean> = {
  leads: (p) => p === "/team" || p.startsWith("/team/leads"),
  "follow-ups": (p) => p.startsWith("/team/follow-ups") || p.startsWith("/team/missed"),
};
// The five-item phone bar holds these; the other tabs (Visits, My performance, Team board) are one tap away from My leads.
const PHONE_BAR = new Set(["leads", "queue", "dial", "follow-ups", "calls"]);

/** The tabs this person may open, in the Founder's order. A tab the Founder switched off is not rendered at all. */
export function TeamNav({ founder = false, tabs = [...DEFAULT_TAB_KEYS] }: { founder?: boolean; tabs?: string[] }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const ITEMS = ALL_TABS.filter((t) => tabs.includes(t.key)).map((t) => ({ href: t.href, label: t.label, match: MATCH[t.key] ?? ((p: string) => p.startsWith(t.href)), phone: PHONE_BAR.has(t.key) }));
  return (
    <>
      <nav aria-label="Team workspace" className="mb-4 hidden gap-x-4 sm:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={i.match(pathname) ? "page" : undefined} className={`inline-flex min-h-11 items-center text-sm font-medium hover:underline ${i.match(pathname) ? "text-foreground" : "text-accent-hover"}`}>
            {i.label}
          </Link>
        ))}
        {founder && (
          <>
            <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
              Founder dashboard
            </Link>
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
              More
            </button>
          </>
        )}
      </nav>
      <nav aria-label="Team quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex">
          {ITEMS.filter((i) => i.phone).map((i) => {
            const on = i.match(pathname);
            return (
              <li key={i.href} className="flex flex-1">
                <Link href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${on ? "text-accent-hover" : "text-muted-foreground"}`}>
                  <span aria-hidden="true" className={`h-1 w-6 rounded-full ${on ? "bg-accent" : "bg-transparent"}`} />
                  {i.label}
                </Link>
              </li>
            );
          })}
          {founder && (
            <li className="flex flex-1">
              <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span aria-hidden="true" className="h-1 w-6 rounded-full bg-transparent" />
                More
              </button>
            </li>
          )}
        </ul>
      </nav>
      {founder && <FounderMoreSheet open={more} onClose={() => setMore(false)} />}
    </>
  );
}
