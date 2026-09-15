"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { CandidateReviewPanel } from "@/components/admin/candidate-review-panel";
import { getCandidateReviewDataAction } from "@/app/admin/_actions/verification-actions";
import type { CandidateReviewData } from "@/app/admin/_actions/verification-actions";
import { isPendingVerificationStatus } from "@/lib/developer-connect/verification-queue-state";
import type { WebsiteCandidate, Developer } from "@/lib/developer-connect/types";

interface QueueRow {
  candidate: WebsiteCandidate;
  developerName: string;
}

/**
 * The inline, expandable Founder review workspace for /admin/verification.
 * Holds its own client-side copy of the queue (seeded from the server's
 * cheap summary fetch) so approving a candidate removes its row
 * immediately, with no `router.refresh()` and no full-list re-fetch —
 * the exact behavior Part 1's fix relies on elsewhere in this feature.
 *
 * Only one row's full review data is ever fetched — on demand, the
 * moment it's expanded, via getCandidateReviewDataAction — so this list
 * can hold hundreds of rows without paying for every developer's
 * evidence/history/sibling-candidates up front (see Performance in the
 * task instructions this component implements).
 */
export function VerificationQueueList({ initialRows }: { initialRows: QueueRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<Record<string, CandidateReviewData>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(candidateId: string) {
    if (expandedId === candidateId) {
      setExpandedId(null);
      return;
    }
    setLoadError(null);
    setExpandedId(candidateId);
    if (!reviewData[candidateId]) {
      startTransition(async () => {
        const result = await getCandidateReviewDataAction(candidateId);
        if (result.ok && result.data) {
          setReviewData((prev) => ({ ...prev, [candidateId]: result.data! }));
        } else {
          setLoadError(result.error ?? "Could not load this candidate's review details.");
        }
      });
    }
  }

  function removeRow(candidateId: string) {
    setRows((prev) => prev.filter((row) => row.candidate.id !== candidateId));
    setExpandedId((current) => (current === candidateId ? null : current));
  }

  /**
   * Keeps the collapsed row's own display name in sync after an inline
   * edit, AND — critically — updates the cached reviewData entry that
   * seeds CandidateReviewPanel's initial state. Without the second part,
   * collapsing and re-expanding this same row remounts the panel with
   * the ORIGINAL fetch (from before the edit), so a just-saved field
   * (e.g. Headquarters) would appear to revert even though the database
   * already has the new value — this is the fix for that exact bug.
   */
  function handleDeveloperUpdated(candidateId: string, developer: Developer) {
    setRows((prev) =>
      prev.map((row) => (row.candidate.id === candidateId ? { ...row, developerName: developer.displayName } : row)),
    );
    setReviewData((prev) =>
      prev[candidateId] ? { ...prev, [candidateId]: { ...prev[candidateId], developer } } : prev,
    );
  }

  /**
   * A row leaves the pending queue the moment its candidate's status is
   * no longer one this queue lists for — true for Approve & Publish
   * (→ VERIFIED), Reject (→ REJECTED), and Deactivate (→ INACTIVE);
   * false for "mark for re-verification", since NEEDS_REVERIFICATION is
   * itself one of the pending statuses. No `router.refresh()` and no
   * re-fetch of the whole list — just a local filter, so every other
   * row (expanded or not) is completely undisturbed.
   *
   * Approval specifically waits a beat before removing the row: the
   * founder needs to actually see ApprovePublishForm's "✓ Verified &
   * Published" confirmation (Part 5) before the row vanishes out from
   * under it — an instant removal would hide that confirmation entirely.
   */
  function handleCandidateUpdated(candidateId: string, updated: WebsiteCandidate) {
    // Same stale-cache fix as handleDeveloperUpdated, for candidate-level
    // saves (e.g. the "Edit URL" control) — keeps the cached reviewData
    // entry current so a collapse/re-expand of this row never shows an
    // older candidate.url than what's actually persisted.
    setReviewData((prev) =>
      prev[candidateId] ? { ...prev, [candidateId]: { ...prev[candidateId], candidate: updated } } : prev,
    );
    if (updated.verificationStatus === "VERIFIED") {
      setRows((prev) => prev.map((row) => (row.candidate.id === candidateId ? { ...row, candidate: updated } : row)));
      window.setTimeout(() => removeRow(candidateId), 1600);
      return;
    }
    if (!isPendingVerificationStatus(updated.verificationStatus)) {
      removeRow(candidateId);
    } else {
      setRows((prev) => prev.map((row) => (row.candidate.id === candidateId ? { ...row, candidate: updated } : row)));
    }
  }

  if (rows.length === 0) {
    // Reachable client-side even when the server sent a non-empty
    // initial list — e.g. the founder just approved/rejected the last
    // pending candidate. Same message the page itself shows when the
    // queue starts out empty, so clearing the queue never leaves a
    // founder staring at a blank area.
    return (
      <EmptyState
        title="Nothing waiting for review"
        description="No website candidates are pending, flagged for re-verification, or newly discovered right now."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {rows.map((row) => {
        const { candidate } = row;
        const isOpen = expandedId === candidate.id;
        const data = reviewData[candidate.id];

        return (
          <li key={candidate.id}>
            <div className="flex min-h-11 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{row.developerName}</p>
                <p className="truncate text-sm text-muted-foreground">{candidate.canonicalDomain}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CandidateStatusBadge status={candidate.verificationStatus} />
                  {"confidence "}
                  {candidate.confidenceScore}
                </div>
                <Link
                  href={`/admin/developers/${candidate.developerId}`}
                  className="hidden text-xs text-muted-foreground hover:underline sm:inline"
                >
                  Open developer details
                </Link>
                <button
                  type="button"
                  onClick={() => toggle(candidate.id)}
                  aria-expanded={isOpen}
                  className={buttonClassName("secondary", "min-h-9 shrink-0 px-3 py-1.5 text-xs")}
                >
                  Review {isOpen ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-border bg-muted/30 p-4">
                <Link
                  href={`/admin/developers/${candidate.developerId}`}
                  className="mb-3 inline-block text-xs text-muted-foreground hover:underline sm:hidden"
                >
                  Open developer details →
                </Link>
                {data ? (
                  <CandidateReviewPanel
                    initialData={data}
                    hideQueueLink
                    onCandidateUpdated={(updated) => handleCandidateUpdated(candidate.id, updated)}
                    onDeveloperUpdated={(developer) => handleDeveloperUpdated(candidate.id, developer)}
                  />
                ) : loadError ? (
                  <p className="text-sm text-red-700" role="alert">
                    {loadError}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{isPending ? "Loading review details…" : ""}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
