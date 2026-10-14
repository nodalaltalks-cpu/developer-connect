import Link from "next/link";

/**
 * ALL LEADS / COLD CALL / DIGITAL: three filtered views of ONE lead table. A lead's source is fixed when it is created and
 * can never change, so these are a stable partition, not separate lists. ("Cold call" is where a lead CAME FROM; the
 * "Cold" temperature chip further down is how WARM the buyer is. They are different things.)
 */
export { SOURCE_FILTERS, SOURCE_FILTER_LABEL, parseSourceFilter, sourceTypeOf, type SourceFilter } from "@/lib/leads/source-filter";
import { SOURCE_FILTERS, SOURCE_FILTER_LABEL, type SourceFilter } from "@/lib/leads/source-filter";

/** `newCounts`: how many NEW leads each bucket holds. A bucket with new leads shows a green badge so they are never overlooked. */
export function LeadSourceTabs({ active, hrefFor, newCounts }: { active: SourceFilter; hrefFor: (filter: SourceFilter) => string; newCounts?: Partial<Record<SourceFilter, number>> }) {
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
              {(newCounts?.[filter] ?? 0) > 0 && (
                <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">{newCounts?.[filter]} new</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
