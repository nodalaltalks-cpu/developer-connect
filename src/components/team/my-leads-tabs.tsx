import Link from "next/link";
import type { MyLeadView } from "@/lib/leads/lead-reads";

export const MY_VIEW_LABELS: Record<MyLeadView, string> = {
  all: "All",
  new: "New",
  follow_up_due: "Follow-up due",
  hot: "Hot",
  missed: "Missed",
};

const ORDER: MyLeadView[] = ["all", "new", "follow_up_due", "hot"];

/** The four filters on My Leads. Chips scroll inside their own row only — the page never scrolls sideways. */
export function MyLeadsTabs({ active }: { active: MyLeadView }) {
  return (
    <nav aria-label="Lead filters">
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {ORDER.map((view) => (
          <li key={view} className="shrink-0">
            <Link
              href={view === "all" ? "/team" : `/team?view=${view}`}
              aria-current={view === active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
                view === active ? "border-accent bg-accent-soft font-medium text-accent-hover" : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {MY_VIEW_LABELS[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
