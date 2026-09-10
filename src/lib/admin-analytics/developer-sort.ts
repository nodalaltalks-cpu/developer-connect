import type { DeveloperStat } from "./types.ts";

export type DeveloperSortKey = "searchResultClicks" | "pageViews" | "officialWebsiteClicks" | "ctr";
export type SortDirection = "asc" | "desc";

/**
 * Pure comparator, extracted so sort behavior is testable without a
 * browser. `ctr` sorts by percent, treating N/A (null percent, i.e. no
 * page views yet) as lowest — an unmeasurable rate should never outrank
 * a real one when sorting descending.
 */
export function sortDevelopers(
  developers: DeveloperStat[],
  key: DeveloperSortKey,
  direction: SortDirection,
): DeveloperStat[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...developers].sort((a, b) => {
    const valueA = key === "ctr" ? (a.ctr.percent ?? -1) : a[key];
    const valueB = key === "ctr" ? (b.ctr.percent ?? -1) : b[key];
    return (valueA - valueB) * factor;
  });
}

export function filterDevelopersByStatus(
  developers: DeveloperStat[],
  status: string | null,
): DeveloperStat[] {
  if (!status || status === "ALL") return developers;
  if (status === "NOT_VERIFIED") {
    return developers.filter((d) => d.verificationStatus !== "VERIFIED");
  }
  return developers.filter((d) => d.verificationStatus === status);
}

export function filterDevelopersByName(developers: DeveloperStat[], query: string): DeveloperStat[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return developers;
  return developers.filter((d) => d.displayName.toLowerCase().includes(needle));
}
