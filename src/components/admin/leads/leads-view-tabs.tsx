import Link from "next/link";
import type { LeadView } from "@/lib/leads/lead-views";

export const VIEW_LABELS: Record<LeadView, string> = {
  attention: "Needs attention",
  new: "New",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  overdue: "Overdue",
  due_today: "Due today",
  qualified: "Qualified",
  all: "All",
};

/** Order the founder scans in. Horizontal scroll inside the chip row only — the page itself never scrolls sideways. */
const ORDER: LeadView[] = ["attention", "new", "hot", "warm", "cold", "overdue", "due_today", "qualified", "all"];

export function LeadsViewTabs({ active, source = "all" }: { active: LeadView; source?: "all" | "cold_call" | "digital" }) {
  const suffix = source === "all" ? "" : `source=${source}`;
  return (
    <nav aria-label="Lead views">
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {ORDER.map((view) => (
          <li key={view} className="shrink-0">
            <Link
              href={[view === "attention" ? "/admin/leads" : `/admin/leads?view=${view}`, suffix ? (view === "attention" ? `?${suffix}` : `&${suffix}`) : ""].join("")}
              aria-current={view === active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
                view === active
                  ? "border-accent bg-accent-soft font-medium text-accent-hover"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {VIEW_LABELS[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
