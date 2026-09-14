"use client";

import { useRouter, usePathname } from "next/navigation";
import type { PublicGeographyOptions } from "@/lib/developer-connect/search-service";

interface GeoFiltersProps {
  options: PublicGeographyOptions;
  selected: { country?: string; state?: string; city?: string };
}

const selectClassName =
  "min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Country -> State -> City, each option list narrowed server-side to only
 * what actually has a verified developer (see listPublicGeographyOptions)
 * — picking Country always clears State/City, picking State always
 * clears City, so the visitor can never end up on a combination with zero
 * results. Deliberately three small selects, not a filter panel — native
 * <select> gives a touch-friendly picker on mobile for free, with no
 * custom bottom-sheet component to build or maintain.
 */
export function GeoFilters({ options, selected }: GeoFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const hasActiveFilter = Boolean(selected.country || selected.state || selected.city);

  function navigate(next: { country?: string; state?: string; city?: string }) {
    const params = new URLSearchParams();
    if (next.country) params.set("country", next.country);
    if (next.state) params.set("state", next.state);
    if (next.city) params.set("city", next.city);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filter by country"
        className={selectClassName}
        value={selected.country ?? ""}
        onChange={(e) => navigate({ country: e.target.value || undefined })}
      >
        <option value="">Country</option>
        {options.countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by state"
        className={selectClassName}
        value={selected.state ?? ""}
        disabled={!selected.country}
        onChange={(e) => navigate({ country: selected.country, state: e.target.value || undefined })}
      >
        <option value="">State</option>
        {options.states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by city"
        className={selectClassName}
        value={selected.city ?? ""}
        disabled={!selected.state}
        onChange={(e) =>
          navigate({ country: selected.country, state: selected.state, city: e.target.value || undefined })
        }
      >
        <option value="">City</option>
        {options.cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={() => navigate({})}
          className="min-h-11 rounded-md px-2 text-sm font-medium text-accent-hover hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
