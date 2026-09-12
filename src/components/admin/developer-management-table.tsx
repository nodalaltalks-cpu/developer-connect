"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DeveloperStat } from "@/lib/admin-analytics/types";
import {
  sortDevelopers,
  type DeveloperSortKey,
  type SortDirection,
} from "@/lib/admin-analytics/developer-sort";
import { RateDisplay } from "./rate-display";
import { EmptyState } from "./empty-state";
import { CandidateStatusBadge } from "./candidate-status-badge";
import { buttonClassName } from "@/components/ui/button";
import type { VerificationStatus } from "@/lib/developer-connect/types";

const KNOWN_VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "NEEDS_REVERIFICATION",
  "INACTIVE",
];

function isKnownVerificationStatus(value: string | null): value is VerificationStatus {
  return value !== null && (KNOWN_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

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

const SEARCH_DEBOUNCE_MS = 300;

function buildHref(search: string, status: string, page: number): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status && status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/developers?${qs}` : "/admin/developers";
}

interface DeveloperManagementTableProps {
  developers: DeveloperStat[];
  /** Developer ids with real, unmet search demand and no verified site — from getHighPriorityVerificationOpportunities(). */
  needsAttentionIds: ReadonlySet<string>;
  /** Total developers matching the current search/status filters, across the whole database — not just this page. */
  totalCount: number;
  /** 1-based. */
  page: number;
  pageSize: number;
  initialSearch: string;
  initialStatus: string;
}

/**
 * Search and the status filter are URL-driven (`?q=`, `?status=`, `?page=`)
 * and resolved server-side in page.tsx, against the entire developers
 * table — not just whatever happens to be on this page. This component
 * only re-sorts the current page's own rows client-side (the existing
 * column-header click-to-sort affordance); it never filters or paginates
 * in the browser.
 */
export function DeveloperManagementTable({
  developers,
  needsAttentionIds,
  totalCount,
  page,
  pageSize,
  initialSearch,
  initialStatus,
}: DeveloperManagementTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [queryInput, setQueryInput] = useState(initialSearch);
  const [statusValue, setStatusValue] = useState(initialStatus);
  const [sortKey, setSortKey] = useState<DeveloperSortKey>("pageViews");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local echo state in sync with the URL (e.g. on back/forward
  // navigation) by adjusting during render rather than in an effect —
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [syncedSearch, setSyncedSearch] = useState(initialSearch);
  if (initialSearch !== syncedSearch) {
    setSyncedSearch(initialSearch);
    setQueryInput(initialSearch);
  }
  const [syncedStatus, setSyncedStatus] = useState(initialStatus);
  if (initialStatus !== syncedStatus) {
    setSyncedStatus(initialStatus);
    setStatusValue(initialStatus);
  }

  function navigate(nextSearch: string, nextStatus: string, nextPage: number) {
    startTransition(() => {
      router.push(buildHref(nextSearch, nextStatus, nextPage));
    });
  }

  function handleSearchChange(value: string) {
    setQueryInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // A new search always starts back at page 1 — the previous page number
    // may no longer exist once the result set shrinks.
    debounceRef.current = setTimeout(() => navigate(value, statusValue, 1), SEARCH_DEBOUNCE_MS);
  }

  function handleStatusChange(value: string) {
    setStatusValue(value);
    navigate(queryInput, value, 1);
  }

  function toggleSort(key: DeveloperSortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  const visible = sortDevelopers(developers, sortKey, sortDirection);
  const hasFilters = Boolean(initialSearch) || initialStatus !== "ALL";
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="admin-dev-search" className="sr-only">
          Search developers
        </label>
        <input
          id="admin-dev-search"
          value={queryInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search by name, legal name, or domain"
          className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-72"
        />
        <label htmlFor="admin-dev-status" className="sr-only">
          Filter by verification status
        </label>
        <select
          id="admin-dev-status"
          value={statusValue}
          onChange={(event) => handleStatusChange(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {totalCount === 0
          ? "Showing 0 developers"
          : `Showing ${rangeStart}–${rangeEnd} of ${totalCount} developer${totalCount === 1 ? "" : "s"}`}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No developers match these filters" : "No developers yet"}
          description={
            hasFilters
              ? "Try a different name or status, or clear the filters."
              : "Developers appear here once they're added to the directory. None have been added yet."
          }
        />
      ) : (
        <>
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
                        {sortKey === column.key && (
                          <span aria-hidden="true">{sortDirection === "desc" ? "↓" : "↑"}</span>
                        )}
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
                        {isKnownVerificationStatus(developer.verificationStatus) ? (
                          <CandidateStatusBadge status={developer.verificationStatus} />
                        ) : (
                          (developer.verificationStatus ?? "Not verified")
                        )}
                        {developer.verificationStatus === "VERIFIED" && developer.hasPendingChanges && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                            ● Unpublished changes
                          </span>
                        )}
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

          <nav
            aria-label="Developer list pages"
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            {page <= 1 ? (
              <span className={buttonClassName("secondary", "pointer-events-none opacity-50")} aria-disabled="true">
                Previous
              </span>
            ) : (
              <Link href={buildHref(initialSearch, initialStatus, page - 1)} className={buttonClassName("secondary")}>
                Previous
              </Link>
            )}

            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>

            {page >= totalPages ? (
              <span className={buttonClassName("secondary", "pointer-events-none opacity-50")} aria-disabled="true">
                Next
              </span>
            ) : (
              <Link href={buildHref(initialSearch, initialStatus, page + 1)} className={buttonClassName("secondary")}>
                Next
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
