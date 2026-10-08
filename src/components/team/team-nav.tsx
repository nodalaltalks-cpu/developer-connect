"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The employee's navigation. On a phone it is a bottom bar in thumb reach (home-indicator safe area respected); from
 * `sm` up the same links sit in a row under the header. Five destinations, the same five on every screen size.
 */
const ITEMS = [
  { href: "/team", label: "My leads", match: (p: string) => p === "/team" || p.startsWith("/team/leads") },
  { href: "/team/queue", label: "Queue", match: (p: string) => p.startsWith("/team/queue") },
  { href: "/team/missed", label: "Follow-ups", match: (p: string) => p.startsWith("/team/missed") },
  { href: "/team/visits", label: "Visits", match: (p: string) => p.startsWith("/team/visits") },
  { href: "/team/calls", label: "Calls", match: (p: string) => p.startsWith("/team/calls") },
];

export function TeamNav() {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Team workspace" className="mb-4 hidden gap-x-4 sm:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={i.match(pathname) ? "page" : undefined} className={`inline-flex min-h-11 items-center text-sm font-medium hover:underline ${i.match(pathname) ? "text-foreground" : "text-accent-hover"}`}>
            {i.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Team quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex">
          {ITEMS.map((i) => {
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
        </ul>
      </nav>
    </>
  );
}
