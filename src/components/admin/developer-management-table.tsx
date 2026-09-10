"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DeveloperStat } from "@/lib/admin-analytics/types";
import {
  sortDevelopers,
  filterDevelopersByStatus,
  filterDevelopersByName,
  type DeveloperSortKey,
  type SortDirection,
} from "@/lib/admin-analytics/developer-sort";
import { RateDisplay } from "./rate-display";
import { EmptyState } from "./empty-state";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "NOT_VERIFIED", label: "Not verified (any reason)" },
  { value: "VERIFIED", label: "Verified" },
  { value: "PENDING_VERIFICATION", label: "Pending verification" },
  { value: "DISCOVERED", label: "Discovered" },
  { value: "NEEDS_REVERIFICATION", label: "Needs re-verification" },
  { value: "REJECTED", label: "Rejected" },
  { value: "INACTIVE", label: "Inactive" },
];

const COLUMNS: { key: DeveloperSortKey; label: string }[] = [
  { key: "searchResultClicks", label: "Search clicks" },
  { key: "pageViews", label: "Page views" },
  { key: "officialWebsiteClicks", label: "Website clicks" },
  { key: "ctr", label: "CTR" },
];

interface DeveloperManagementTableProps {
  developers: DeveloperStat[];
  /** Developer ids with real, unmet search demand and no verified site — from getHighPriorityVerificationOpportunities(). */
  needsAttentionIds: ReadonlySet<string>;
}

export function DeveloperManagementTable({
  developers,
  needsAttentionIds,
}: DeveloperManagementTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sortKey, setSortKey] = useState<DeveloperSortKey>("pageViews");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const visible = useMemo(() => {
    const byName = filterDevelopersByName(developers, query);
    const byStatus = filterDevelopersByStatus(byName, status);
    return sortDevelopers(byStatus, sortKey, sortDirection);
  }, [developers, query, status, sortKey, sortDirection]);

  function toggleSort(key: DeveloperSortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="admin-dev-search" className="sr-only">
          Search developers
        </label>
        <input
          id="admin-dev-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
          className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
        />
        <label htmlFor="admin-dev-status" className="sr-only">
          Filter by verification status
        </label>
        <select
          id="admin-dev-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={query || status !== "ALL" ? "No developers match these filters" : "No developers yet"}
          description={
            query || status !== "ALL"
              ? "Try a different name or status, or clear the filters."
              : "Developers appear here once they're added to the directory. None have been added yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Developer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="flex min-h-11 items-center gap-1 font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      {column.label}
                      {sortKey === column.key && <span aria-hidden="true">{sortDirection === "desc" ? "↓" : "↑"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((developer) => {
                const flagged = needsAttentionIds.has(developer.developerId);
                return (
                  <tr key={developer.developerId} className={flagged ? "bg-accent-soft/40" : undefined}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/developers/${developer.developerId}`}
                        className="font-medium text-foreground hover:text-accent-hover"
                      >
                        {developer.displayName}
                      </Link>
                      {flagged && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-hover">
                          Needs attention
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {developer.verificationStatus ?? "Not verified"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{developer.searchResultClicks}</td>
                    <td className="px-4 py-3 text-muted-foreground">{developer.pageViews}</td>
                    <td className="px-4 py-3 text-muted-foreground">{developer.officialWebsiteClicks}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <RateDisplay rate={developer.ctr} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
