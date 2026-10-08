import type { LeadSourceType } from "./types.ts";

/** The three source views of the one lead table, parsed from the address. Kept free of React so tests and server code can use it. */
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
