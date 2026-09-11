"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { updateDeveloperAction } from "@/app/admin/_actions/developer-actions";
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

function toFields(developer: Developer): FieldsState {
  return {
    legalName: developer.legalName,
    displayName: developer.displayName,
    city: developer.city,
    state: developer.state,
    country: developer.country,
    headquartersLocation: developer.headquartersLocation ?? "",
  };
}

/**
 * The one editable-record + Save control on the founder review page.
 * `savedAt` (rather than a plain boolean) makes every successful save its
 * own distinct event, so the "Saved" confirmation reliably reappears even
 * if the founder saves the exact same values twice in a row.
 */
export function DeveloperEditForm({ developer }: { developer: Developer }) {
  const [fields, setFields] = useState<FieldsState>(() => toFields(developer));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
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
        setSavedAt(Date.now());
        router.refresh();
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
        {savedAt && !error && !isPending && (
          <span className="text-sm text-accent-hover" role="status" aria-live="polite">
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}
