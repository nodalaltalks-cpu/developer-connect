import Link from "next/link";
import { ALL_TABS } from "@/lib/staff/tab-access";

/** Tabs that have no slot in the phone's five-item bottom bar (Visits, My performance, Team board), one tap from My leads. Phones only. */
const NOT_IN_PHONE_BAR = new Set(["visits", "performance", "team-board"]);

export function MoreTabs({ tabs }: { tabs: string[] }) {
  const items = ALL_TABS.filter((t) => tabs.includes(t.key) && NOT_IN_PHONE_BAR.has(t.key));
  if (items.length === 0) return null;
  return (
    <nav aria-label="More tabs" className="mb-4 flex flex-wrap gap-2 sm:hidden">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-accent-hover hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
