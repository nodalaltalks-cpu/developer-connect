"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/admin/command-centre", label: "Command centre" },
  { href: "/admin", label: "Overview" },
  { href: "/admin/platform-health", label: "Platform Health" },
  { href: "/admin/developers", label: "Developers" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/team", label: "My calling workspace" },
  { href: "/admin/missed-leads", label: "Missed Leads" },
  { href: "/admin/returned-leads", label: "Returned Leads" },
  { href: "/admin/calling-batches", label: "Calling batches" },
  { href: "/admin/intelligence", label: "Intelligence" },
  { href: "/admin/behaviour", label: "Visitor behaviour" },
  { href: "/admin/acquisition", label: "Acquisition" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/spend", label: "Marketing spend" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/testimonials", label: "Testimonials" },
  { href: "/admin/retention", label: "Retention" },
  { href: "/admin/sales-automation", label: "Sales automation" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/site-visits", label: "Site visits" },
  { href: "/admin/call-activity", label: "Call Activity" },
  { href: "/admin/employee-insights", label: "Employee Insights" },
  { href: "/admin/source-analytics", label: "Cold vs Digital" },
  { href: "/admin/leads/import", label: "Import Leads" },
  { href: "/admin/staff", label: "Team" },
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
export function getActiveHref(pathname: string): string | null {
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
export function AdminNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <ul className="hidden gap-1 text-sm lg:flex lg:flex-col">
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
              {badges[item.href] ? (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700" aria-label={`${badges[item.href]} need attention`}>
                  {badges[item.href]}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
