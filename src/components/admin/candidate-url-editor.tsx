"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { ExternalDomainLink } from "@/components/external-domain-link";
import { updateCandidateUrlAction } from "@/app/admin/_actions/candidate-actions";
import type { WebsiteCandidate } from "@/lib/developer-connect/types";

const inputClassName =
  "w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The official-website URL shown inside CandidateReviewPanel: a clickable
 * "domain ↗" link by default (Part 4), with an "Edit URL" control that
 * swaps in a plain text field + Save (Part 2).
 *
 * Save renders directly from the Server Action's own returned candidate —
 * never from a locally-guessed value and never via `router.refresh()` —
 * for the same stale-value reason documented on DeveloperEditForm's
 * `onSaved`. This is the exact bug class Part 3 of the review task
 * describes, applied here so the new URL-editing feature can't reintroduce
 * it: after Save, the same "confidence" the "✓ Changes saved" text implies
 * must be reflected in what's actually rendered, immediately and after a
 * refresh.
 */
export function CandidateUrlEditor({
  candidate,
  onSaved,
}: {
  candidate: WebsiteCandidate;
  /** Called with the freshly-saved candidate — the caller (CandidateReviewPanel) keeps it in state so every other section reading candidate.url stays in sync without a page reload. */
  onSaved: (candidate: WebsiteCandidate) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(candidate.url);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setValue(candidate.url);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setValue(candidate.url);
    setError(null);
  }

  function save() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCandidateUrlAction({ candidateId: candidate.id, url: value });
      if (result.ok && result.candidate) {
        onSaved(result.candidate);
        setValue(result.candidate.url);
        setSavedAt(Date.now());
        setEditing(false);
      } else {
        setError(result.error ?? "Could not save the new URL.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-3">
        <ExternalDomainLink url={candidate.url} domain={candidate.canonicalDomain} />
        <button type="button" onClick={startEditing} className="text-xs font-medium text-accent-hover hover:underline">
          Edit URL
        </button>
        {savedAt && (
          <span className="text-xs font-medium text-green-700" role="status" aria-live="polite">
            ✓ Changes saved
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          className={inputClassName}
          aria-label="Official website URL"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className={buttonClassName("secondary", "min-h-9 shrink-0 px-3 py-1.5 text-xs")}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className={buttonClassName("secondary", "min-h-9 shrink-0 px-3 py-1.5 text-xs")}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" aria-live="polite" className="mt-1.5 text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
