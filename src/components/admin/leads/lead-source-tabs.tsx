import Link from "next/link";
import type { LeadSourceType } from "@/lib/leads/types";

/**
 * ALL LEADS / COLD CALL / DIGITAL: three filtered views of ONE lead table. A lead's source is fixed when it is created and
 * can never change, so these are a stable partition, not separate lists. ("Cold call" is where a lead CAME FROM; the
 * "Cold" temperature chip further down is how WARM the buyer is. They are different things.)
 */
export const SOURCE_FILTERS = ["all", "cold_call", "digital"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const SOURCE_FILTER_LABEL: Record<SourceFilter, string> = { all: "All leads", cold_call: "Cold call", digital: "Digital" };

export function parseSourceFilter(value: string | string[] | undefined): SourceFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SOURCE_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as SourceFilter) : "all";
}

export function sourceTypeOf(filter: SourceFilter): LeadSourceType | undefined {
  return filter === "cold_call" ? "COLD_CALL" : filter === "digital" ? "DIGITAL" : undefined;
}

export function LeadSourceTabs({ active, hrefFor }: { active: SourceFilter; hrefFor: (filter: SourceFilter) => string }) {
  return (
    <nav aria-label="Lead source">
      <ul className="inline-flex rounded-full border border-border p-1">
        {SOURCE_FILTERS.map((filter) => (
          <li key={filter}>
            <Link
              href={hrefFor(filter)}
              aria-current={filter === active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors ${
                filter === active ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              {SOURCE_FILTER_LABEL[filter]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
