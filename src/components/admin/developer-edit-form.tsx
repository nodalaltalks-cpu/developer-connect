"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { updateDeveloperAction } from "@/app/admin/_actions/developer-actions";
import { effectiveDeveloperFields } from "@/lib/developer-connect/developer-service";
import type { Developer } from "@/lib/developer-connect/types";

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

interface FieldsState {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation: string;
}

/**
 * Pre-populates from the EFFECTIVE value (published, overridden by any
 * already-pending change) — not just the published columns — so a second
 * edit before republishing builds on the first one instead of silently
 * reverting it. See effectiveDeveloperFields in developer-service.ts.
 */
function toFields(developer: Developer): FieldsState {
  const effective = effectiveDeveloperFields(developer);
  return {
    legalName: effective.legalName ?? "",
    displayName: effective.displayName ?? "",
    city: effective.city ?? "",
    state: effective.state ?? "",
    country: effective.country ?? "",
    headquartersLocation: effective.headquartersLocation ?? "",
  };
}

/**
 * The one editable-record + Save control on the founder review page.
 * `savedAt` (rather than a plain boolean) makes every successful save its
 * own distinct event, so the "Saved" confirmation reliably reappears even
 * if the founder saves the exact same values twice in a row.
 */
export function DeveloperEditForm({
  developer,
  onCancel,
  onSaved,
}: {
  developer: Developer;
  /** When provided, renders a "Cancel" button next to "Save changes" — used by the collapsible edit toggle on the developer detail page. */
  onCancel?: () => void;
  /**
   * Called with the freshly-saved developer instead of this component
   * ever forcing a full route refresh. The caller (an ancestor holding
   * `developer` in state) is responsible for propagating it to whatever
   * sibling UI depends on it — this keeps a plain field save an inline,
   * local update rather than a full-page re-render that resets scroll
   * position and collapses whatever section the founder had open.
   */
  onSaved?: (developer: Developer) => void;
}) {
  const [fields, setFields] = useState<FieldsState>(() => toFields(developer));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedAsPending, setSavedAsPending] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus();
    }
  }, [error]);

  function update<K extends keyof FieldsState>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (isPending) return; // guards against a duplicate submit from a double-click
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateDeveloperAction({
        id: developer.id,
        legalName: fields.legalName,
        displayName: fields.displayName,
        city: fields.city,
        state: fields.state,
        country: fields.country,
        headquartersLocation: fields.headquartersLocation || undefined,
      });
      if (result.ok && result.developer) {
        setFields(toFields(result.developer));
        setSavedAsPending(result.developer.pendingChanges !== null);
        setSavedAt(Date.now());
        onSaved?.(result.developer);
      } else {
        setError(result.error ?? "Could not save changes.");
      }
    });
  }

  return (
    <div ref={containerRef} className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Developer</h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName} htmlFor="edit-displayName">
            Display name
          </label>
          <input
            id="edit-displayName"
            required
            value={fields.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-legalName">
            Legal name
          </label>
          <input
            id="edit-legalName"
            required
            value={fields.legalName}
            onChange={(e) => update("legalName", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-city">
            City
          </label>
          <input
            id="edit-city"
            required
            value={fields.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-state">
            State
          </label>
          <input
            id="edit-state"
            required
            value={fields.state}
            onChange={(e) => update("state", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-country">
            Country
          </label>
          <input
            id="edit-country"
            required
            value={fields.country}
            onChange={(e) => update("country", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="edit-hq">
            Headquarters <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="edit-hq"
            value={fields.headquartersLocation}
            onChange={(e) => update("headquartersLocation", e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="polite"
          className="mt-3 text-sm text-red-700 focus:outline-none"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={buttonClassName("secondary")}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isPending} className={buttonClassName("secondary")}>
            Cancel
          </button>
        )}
      </div>

      {savedAt && !error && !isPending && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2" role="status" aria-live="polite">
          <p className="text-sm font-medium text-green-700">✓ Changes saved</p>
          {savedAsPending && (
            <p className="mt-1 text-sm text-green-700">
              This developer is published — these changes are unpublished until you Republish (see below).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
