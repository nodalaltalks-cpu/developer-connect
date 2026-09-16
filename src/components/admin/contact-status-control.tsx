"use client";

import { useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { changeContactStatusAction, type ContactHistoryEntryView } from "@/app/admin/_actions/contact-actions";
import type { ContactStatus, ContactSubmission } from "@/lib/engagement/types";

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_LABEL: Record<ContactStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ContactStatus, string>;

/** Restrained blue/green/amber/red per Part 45 — no other colors, no gradients. */
const STATUS_BADGE_CLASS: Record<ContactStatus, string> = {
  OPEN: "bg-muted text-foreground",
  IN_REVIEW: "bg-accent-soft text-accent-hover",
  ON_HOLD: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

/** Exact confirmation copy required by the task (Part 3). */
const FEEDBACK_COPY: Record<ContactStatus, string> = {
  OPEN: "Request reopened.",
  IN_REVIEW: "Request marked as in review.",
  ON_HOLD: "Request placed on hold.",
  RESOLVED: "Request marked as resolved.",
  REJECTED: "Request marked as rejected.",
};

/**
 * The Contact-specific status control: a clean dropdown (Part 2) that,
 * for a genuine transition, reveals an OPTIONAL single-line internal note
 * (Parts 4/5 — never required, Part 4's own example is exactly this kind
 * of short reason) before confirming. Selecting the status a submission
 * is already in does nothing (Part 30's idempotency) — the dropdown just
 * shows the current value, no confirm row appears.
 *
 * Updates local state from the Server Action's own returned submission +
 * history, never an optimistic guess — same reasoning as
 * DeveloperEditForm/EngagementStatusSelect elsewhere in this codebase.
 */
export function ContactStatusControl({
  id,
  status,
  onChanged,
}: {
  id: string;
  status: ContactStatus;
  onChanged: (submission: ContactSubmission, history: ContactHistoryEntryView[]) => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<ContactStatus | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: ContactStatus) {
    setError(null);
    setFeedback(null);
    if (next === status) return;
    setPendingStatus(next);
    setNote("");
  }

  function confirm() {
    if (!pendingStatus) return;
    const next = pendingStatus;
    startTransition(async () => {
      const result = await changeContactStatusAction(id, next, note || undefined);
      if (result.ok && result.submission && result.history) {
        onChanged(result.submission, result.history);
        setFeedback(FEEDBACK_COPY[next]);
        setPendingStatus(null);
        setNote("");
      } else {
        setError(result.error ?? "Could not update status.");
      }
    });
  }

  function cancel() {
    setPendingStatus(null);
    setNote("");
    setError(null);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        <select
          aria-label="Change status"
          value={pendingStatus ?? status}
          disabled={isPending}
          onChange={(e) => handleSelect(e.target.value as ContactStatus)}
          className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {pendingStatus && (
        <div className="mt-2 w-64 rounded-md border border-border bg-muted/30 p-2.5">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor={`contact-note-${id}`}>
            Internal note (optional) — never sent to the requester
          </label>
          <input
            id={`contact-note-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Waiting for additional information"
            className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={isPending}
              className={buttonClassName("secondary", "min-h-8 px-3 py-1 text-xs")}
            >
              {isPending ? "Saving…" : `Set to ${STATUS_LABEL[pendingStatus]}`}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {feedback && !pendingStatus && (
        <p className="mt-1 text-xs text-green-700" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
