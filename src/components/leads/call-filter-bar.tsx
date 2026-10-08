import Link from "next/link";
import { CALL_OUTCOME_FILTERS, CALL_OUTCOME_LABEL, type CallOutcomeFilter } from "@/lib/leads/call-analytics";

/**
 * Filters for a call list, as plain links so they work without JavaScript and keep each other's choices. One bar serves the
 * team member's own list and the Founder's feed: the same filters mean the same thing in both.
 */

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
] as const;
const SOURCES = [
  { key: "", label: "All sources" },
  { key: "COLD_CALL", label: "Cold call" },
  { key: "DIGITAL", label: "Digital" },
] as const;

export interface CallFilterState {
  range: string;
  outcome: CallOutcomeFilter;
  source: string;
  employee?: string;
}

const CHIP = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CallFilterBar({ basePath, state }: { basePath: string; state: CallFilterState }) {
  const href = (patch: Partial<CallFilterState>) => {
    const next = { ...state, ...patch };
    const query = new URLSearchParams();
    query.set("range", next.range);
    if (next.outcome !== "all") query.set("outcome", next.outcome);
    if (next.source) query.set("source", next.source);
    if (next.employee) query.set("employee", next.employee);
    return `${basePath}?${query.toString()}`;
  };
  const chip = (active: boolean) => `${CHIP} ${active ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground"}`;

  return (
    <div className="mb-4 space-y-2" aria-label="Call filters">
      <nav aria-label="Date range" className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={href({ range: r.key })} aria-current={state.range === r.key ? "page" : undefined} className={chip(state.range === r.key)}>
            {r.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Outcome" className="flex flex-wrap gap-2">
        {CALL_OUTCOME_FILTERS.map((o) => (
          <Link key={o} href={href({ outcome: o })} aria-current={state.outcome === o ? "page" : undefined} className={chip(state.outcome === o)}>
            {CALL_OUTCOME_LABEL[o]}
          </Link>
        ))}
      </nav>
      <nav aria-label="Lead source" className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Link key={s.key} href={href({ source: s.key })} aria-current={state.source === s.key ? "page" : undefined} className={chip(state.source === s.key)}>
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
