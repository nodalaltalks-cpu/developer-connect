"use client";

import { useState, useTransition } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { buttonClassName } from "@/components/ui/button";
import { restoreContactAction, permanentlyDeleteContactAction } from "@/app/admin/_actions/contact-actions";
import type { ContactSubmission } from "@/lib/engagement/types";

const REASON_LABELS: Record<string, string> = {
  GENERAL_QUESTION: "General question",
  REPORT_INACCURATE_INFO: "Report inaccurate information",
  DEVELOPER_LISTING: "Developer listing",
  PARTNERSHIP: "Partnership",
  OTHER: "Other",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

/**
 * Founder-only Trash for Contact submissions (Part 13). Restore and
 * Delete permanently both go through Server Actions that re-check
 * Founder authorization themselves (Part 14/39) — this component (and
 * the page it lives on) is a UI convenience, never the security
 * boundary. Permanent delete requires an explicit native confirm() with
 * the exact "cannot be undone" copy the task specifies (Part 15/48)
 * before the action is ever called.
 */
export function ContactTrashList({ initialSubmissions }: { initialSubmissions: ContactSubmission[] }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function clearError(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleRestore(id: string) {
    clearError(id);
    startTransition(async () => {
      const result = await restoreContactAction(id);
      if (result.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setErrors((prev) => ({ ...prev, [id]: result.error ?? "Could not restore this request." }));
      }
    });
  }

  function handlePermanentDelete(id: string) {
    const confirmed = window.confirm("Delete permanently?\n\nThis action cannot be undone.");
    if (!confirmed) return;

    clearError(id);
    startTransition(async () => {
      const result = await permanentlyDeleteContactAction(id);
      if (result.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setErrors((prev) => ({ ...prev, [id]: result.error ?? "Could not permanently delete this request." }));
      }
    });
  }

  if (submissions.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        description="Requests moved to Trash from Contact Submissions will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {submissions.map((submission) => (
        <li key={submission.id} className="px-4 py-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                {submission.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {REASON_LABELS[submission.reason] ?? submission.reason}
                </span>
              </p>
              <p className="mt-1 line-clamp-2 text-foreground">{submission.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {submission.email}
                {" · Status: "}
                {STATUS_LABEL[submission.status] ?? submission.status}
                {" · Deleted "}
                {submission.deletedAt ? submission.deletedAt.toLocaleString() : "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleRestore(submission.id)}
                disabled={isPending}
                className={buttonClassName("secondary", "min-h-9 px-3 py-1.5 text-xs")}
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => handlePermanentDelete(submission.id)}
                disabled={isPending}
                className="min-h-9 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete permanently
              </button>
            </div>
          </div>
          {errors[submission.id] && (
            <p className="mt-1 text-xs text-red-700" role="alert">
              {errors[submission.id]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
