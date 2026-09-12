"use client";

import { useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { republishDeveloperAction, discardPendingChangesAction } from "@/app/admin/_actions/developer-actions";
import type { Developer, DeveloperEditableField } from "@/lib/developer-connect/types";

const FIELD_LABELS: Record<DeveloperEditableField, string> = {
  legalName: "Legal name",
  displayName: "Display name",
  city: "City",
  state: "State",
  country: "Country",
  headquartersLocation: "Headquarters location",
};

/**
 * Shown only when developer.pendingChanges is set — a real, data-backed
 * fact, never inferred from client state. "Review changes" expands a
 * plain published-vs-pending comparison for exactly the fields that
 * differ; Republish and Discard call the existing Server Actions, which
 * are the only things that ever touch developer.pendingChanges after
 * Save.
 */
export function DeveloperPublishPanel({
  developer,
  onChange,
}: {
  developer: Developer;
  /** Called with the freshly-updated developer instead of forcing a full route refresh. */
  onChange?: (developer: Developer) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [republishedAt, setRepublishedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = developer.pendingChanges;
  if (!pending && !republishedAt) return null;

  const changedFields = (Object.keys(FIELD_LABELS) as DeveloperEditableField[]).filter(
    (field) => pending && field in pending,
  );

  function handleRepublish() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await republishDeveloperAction(developer.id);
      if (result.ok && result.developer) {
        setRepublishedAt(new Date());
        setReviewing(false);
        onChange?.(result.developer);
      } else {
        setError(result.error ?? "Could not republish this developer.");
      }
    });
  }

  function handleDiscard() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await discardPendingChangesAction(developer.id);
      if (result.ok && result.developer) {
        setReviewing(false);
        onChange?.(result.developer);
      } else {
        setError(result.error ?? "Could not discard these changes.");
      }
    });
  }

  if (republishedAt && !pending) {
    return (
      <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-3 py-2">
        <p className="text-sm font-medium text-green-700">✓ Republished</p>
        <p className="mt-1 text-sm text-green-700">
          Published: {republishedAt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
          {", "}
          {republishedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">● Unpublished changes</p>
      <p className="mt-1 text-sm text-amber-800">
        The public page still shows the previously published information until you republish.
      </p>

      {error && (
        <p role="alert" aria-live="polite" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => setReviewing((v) => !v)} className={buttonClassName("secondary")}>
          {reviewing ? "Hide changes" : "Review changes"}
        </button>
        <button
          type="button"
          onClick={handleRepublish}
          disabled={isPending}
          className={buttonClassName("primary")}
        >
          {isPending ? "Republishing…" : "Republish changes"}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={isPending}
          className={buttonClassName("secondary")}
        >
          Discard unpublished changes
        </button>
      </div>

      {reviewing && (
        <div className="mt-4 overflow-x-auto rounded-md border border-amber-200 bg-background">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-amber-200 bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-800">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Currently published</th>
                <th className="px-3 py-2 font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {changedFields.map((field) => (
                <tr key={field}>
                  <td className="px-3 py-2 font-medium text-foreground">{FIELD_LABELS[field]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {(field === "headquartersLocation" ? developer.headquartersLocation : developer[field]) || "—"}
                  </td>
                  <td className="px-3 py-2 text-foreground">{pending?.[field] || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
