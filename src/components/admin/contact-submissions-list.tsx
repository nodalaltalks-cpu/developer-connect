"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/admin/empty-state";
import { ContactStatusControl } from "@/components/admin/contact-status-control";
import { ContactActivityHistory } from "@/components/admin/contact-activity-history";
import {
  getContactHistoryAction,
  moveContactToTrashAction,
  type ContactHistoryEntryView,
} from "@/app/admin/_actions/contact-actions";
import type { ContactSubmission } from "@/lib/engagement/types";

const REASON_LABELS: Record<string, string> = {
  GENERAL_QUESTION: "General question",
  REPORT_INACCURATE_INFO: "Report inaccurate information",
  DEVELOPER_LISTING: "Developer listing",
  PARTNERSHIP: "Partnership",
  OTHER: "Other",
};

/**
 * The Founder's active Contact list — expandable cards (Part 46), each
 * holding its own lazily-loaded activity history (only fetched the
 * moment it's opened, same reasoning as VerificationQueueList/
 * getCandidateReviewDataAction). Every update comes from a Server
 * Action's own returned data, never router.refresh() or an optimistic
 * guess, so the list, the status badge, and the history all stay
 * consistent with each other and with the database (Part 32's
 * "real-time admin experience").
 */
export function ContactSubmissionsList({ initialSubmissions }: { initialSubmissions: ContactSubmission[] }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, ContactHistoryEntryView[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setLoadError(null);
    setExpandedId(id);
    if (!historyById[id]) {
      startTransition(async () => {
        const result = await getContactHistoryAction(id);
        if (result.ok && result.history) {
          setHistoryById((prev) => ({ ...prev, [id]: result.history! }));
        } else {
          setLoadError(result.error ?? "Could not load activity history.");
        }
      });
    }
  }

  function handleStatusChanged(id: string, submission: ContactSubmission, history: ContactHistoryEntryView[]) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? submission : s)));
    setHistoryById((prev) => ({ ...prev, [id]: history }));
  }

  function handleMoveToTrash(id: string) {
    const confirmed = window.confirm(
      "Move this request to Trash?\n\nThis will remove it from the active Contact list. You can restore it from Trash.",
    );
    if (!confirmed) return;

    setTrashError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      const result = await moveContactToTrashAction(id);
      if (result.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
        setExpandedId((current) => (current === id ? null : current));
      } else {
        setTrashError((prev) => ({ ...prev, [id]: result.error ?? "Could not move this request to Trash." }));
      }
    });
  }

  if (submissions.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        description="A message will appear here the moment someone submits the Contact Us form."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {submissions.map((submission) => {
        const isOpen = expandedId === submission.id;
        const history = historyById[submission.id];

        return (
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
                  <a href={`mailto:${submission.email}`} className="text-accent-hover hover:underline">
                    {submission.email}
                  </a>
                  {" · "}
                  {submission.createdAt.toLocaleString()}
                  {submission.userId && (
                    <>
                      {" · "}
                      <Link href={`/admin/users/${submission.userId}`} className="text-accent-hover hover:underline">
                        View profile
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <ContactStatusControl
                id={submission.id}
                status={submission.status}
                onChanged={(sub, hist) => handleStatusChanged(submission.id, sub, hist)}
              />
            </div>

            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() => toggle(submission.id)}
                className="min-h-9 text-xs font-medium text-accent-hover hover:underline"
              >
                {isOpen ? "Hide details" : "View / Expand"}
              </button>
              <button
                type="button"
                onClick={() => handleMoveToTrash(submission.id)}
                disabled={isPending}
                className="min-h-9 text-xs text-muted-foreground hover:text-red-700 hover:underline"
              >
                Move to Trash
              </button>
            </div>
            {trashError[submission.id] && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                {trashError[submission.id]}
              </p>
            )}

            {isOpen && (
              <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request details</p>
                  <dl className="mt-1.5 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Name</dt>
                      <dd className="text-foreground">{submission.name}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Email</dt>
                      <dd className="text-foreground">{submission.email}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Category</dt>
                      <dd className="text-foreground">{REASON_LABELS[submission.reason] ?? submission.reason}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Message</dt>
                      <dd className="whitespace-pre-wrap text-foreground">{submission.message}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
                  <div className="mt-1.5">
                    {history ? (
                      <ContactActivityHistory history={history} />
                    ) : loadError ? (
                      <p className="text-xs text-red-700" role="alert">
                        {loadError}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{isPending ? "Loading…" : ""}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
