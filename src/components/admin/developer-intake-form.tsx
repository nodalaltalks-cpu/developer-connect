"use client";

import { useState, useTransition, FormEvent } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import {
  createDeveloperAction,
  type CreateDeveloperActionResult,
} from "@/app/admin/_actions/developer-actions";

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

const EMPTY_FIELDS: FieldsState = {
  legalName: "",
  displayName: "",
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  headquartersLocation: "",
};

/**
 * Creates a Developer via the existing createDeveloper() service, through
 * the founder-gated createDeveloperAction. This form does not decide
 * whether the entry is a duplicate or valid — it only displays whatever
 * the service layer (findLikelyDuplicateDeveloper / createDeveloper)
 * decides, so business rules live in one place.
 */
export function DeveloperIntakeForm() {
  const [fields, setFields] = useState<FieldsState>(EMPTY_FIELDS);
  const [result, setResult] = useState<CreateDeveloperActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FieldsState>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await createDeveloperAction({
        legalName: fields.legalName,
        displayName: fields.displayName,
        city: fields.city,
        state: fields.state,
        country: fields.country,
        headquartersLocation: fields.headquartersLocation || undefined,
      });
      setResult(outcome);
      if (outcome.ok) {
        setFields(EMPTY_FIELDS);
      }
    });
  }

  if (result?.ok && result.developer) {
    const developer = result.developer;
    return (
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">
          &ldquo;{developer.displayName}&rdquo; was created.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          This developer isn&apos;t public yet — nothing is visible in search until a website
          candidate is submitted and a founder verifies it.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href={`/admin/developers/${developer.id}/candidates/new`}
            className={buttonClassName("primary")}
          >
            Add its website candidate
          </Link>
          <Link href={`/admin/developers/${developer.id}`} className={buttonClassName("secondary")}>
            View developer
          </Link>
          <button
            type="button"
            onClick={() => setResult(null)}
            className={buttonClassName("secondary")}
          >
            Add another developer
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClassName} htmlFor="displayName">
          Display name
        </label>
        <p className="text-xs text-muted-foreground">The commonly recognized brand name.</p>
        <input
          id="displayName"
          required
          value={fields.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className={inputClassName}
          placeholder="e.g. Lodha"
        />
      </div>

      <div>
        <label className={labelClassName} htmlFor="legalName">
          Legal name
        </label>
        <p className="text-xs text-muted-foreground">The registered corporate name.</p>
        <input
          id="legalName"
          required
          value={fields.legalName}
          onChange={(e) => update("legalName", e.target.value)}
          className={inputClassName}
          placeholder="e.g. Macrotech Developers Limited"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClassName} htmlFor="city">
            City
          </label>
          <input
            id="city"
            required
            value={fields.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="state">
            State
          </label>
          <input
            id="state"
            required
            value={fields.state}
            onChange={(e) => update("state", e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="country">
            Country
          </label>
          <input
            id="country"
            required
            value={fields.country}
            onChange={(e) => update("country", e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div>
        <label className={labelClassName} htmlFor="headquartersLocation">
          Headquarters location <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="headquartersLocation"
          value={fields.headquartersLocation}
          onChange={(e) => update("headquartersLocation", e.target.value)}
          className={inputClassName}
          placeholder="e.g. Lodha Excelus, Apollo Mills, Mumbai"
        />
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{result.error}</p>
          {result.duplicateOf && (
            <p className="mt-2">
              <Link href={`/admin/developers/${result.duplicateOf.id}`} className="font-medium underline">
                Review the existing &ldquo;{result.duplicateOf.displayName}&rdquo; record →
              </Link>
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={isPending} className={buttonClassName("primary")}>
        {isPending ? "Creating…" : "Create developer"}
      </button>
    </form>
  );
}
