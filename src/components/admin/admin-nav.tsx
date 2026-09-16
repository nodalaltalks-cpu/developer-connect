"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { href: "/admin/contact/trash", label: "Trash" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/data-quality", label: "Data Quality" },
  { href: "/admin/automation", label: "Automation" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/ai-readiness", label: "AI/ML Readiness" },
  { href: "/admin/learning", label: "Learning" },
];

/**
 * The single item that should be highlighted for a given pathname — the
 * LONGEST matching href among NAV_ITEMS, never "every ancestor that
 * happens to prefix-match". Without this, a child route like
 * /admin/contact/trash would highlight both "Contact" and "Trash" at
 * once (both are real prefix matches), which defeats the point of Trash
 * being its own distinct section. "/admin" itself is matched exactly —
 * every route is technically prefixed by it, so it can never win a
 * longest-match comparison against a real section by accident, but an
 * exact check keeps that guarantee explicit rather than incidental.
 */
function getActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    const matches =
      item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

/**
 * The Founder dashboard's left/top navigation (Part 12 of the admin UX
 * polish task) — a Client Component (unlike the rest of admin/layout.tsx)
 * purely because highlighting the active section needs the current
 * pathname, which only usePathname() can give without prop-drilling it
 * through every nested layout.
 */
export function AdminNav() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <ul className="flex gap-1 overflow-x-auto pb-2 text-sm lg:flex-col lg:overflow-visible lg:pb-0">
      {NAV_ITEMS.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href} className="shrink-0 lg:shrink">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block min-h-11 whitespace-nowrap rounded-md px-3 py-2.5 leading-6 transition-colors ${
                active
                  ? "bg-accent-soft font-medium text-accent-hover"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
