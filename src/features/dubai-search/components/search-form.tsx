"use client";

import { useState } from "react";
import { SOURCES } from "../lib/sources.ts";
import type { PropertyType, SearchFilters, SourceId } from "../lib/types.ts";
import { BTN, CHIP, CHIP_OFF, CHIP_ON, FIELD, LABEL } from "./ui.ts";

const COMMUNITIES = ["Jumeirah Village Circle", "Dubai Marina", "Downtown Dubai", "Dubai"];
const TYPES: Array<{ id: PropertyType; label: string }> = [
  { id: "apartment", label: "Apartment" },
  { id: "villa", label: "Villa" },
  { id: "townhouse", label: "Townhouse" },
  { id: "penthouse", label: "Penthouse" },
  { id: "other", label: "Other" },
];
const BEDS = [
  { id: 0, label: "Studio" },
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
  { id: 4, label: "4+" },
];

function numberOrNull(v: string): number | null {
  const t = v.replace(/[^0-9.]/g, "");
  return t === "" ? null : Number(t);
}

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function SearchForm({ value, onSearch }: { value: SearchFilters; onSearch: (f: SearchFilters) => void }) {
  const [f, setF] = useState<SearchFilters>(value);
  const set = (patch: Partial<SearchFilters>) => setF((cur) => ({ ...cur, ...patch }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(f);
      }}
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6"
      aria-label="Search Dubai properties"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className={LABEL}>Where in Dubai?</span>
            <input list="dcds-communities" value={f.query} onChange={(e) => set({ query: e.target.value })} placeholder="Community or building, e.g. JVC" className={`${FIELD} mt-1`} autoComplete="off" />
            <datalist id="dcds-communities">
              {COMMUNITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div role="group" aria-label="Buy or rent" className="flex items-end gap-2">
            {(["buy", "rent"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={f.purpose === p} onClick={() => set({ purpose: p })} className={`${CHIP} flex-1 sm:flex-none ${f.purpose === p ? CHIP_ON : CHIP_OFF}`}>
                {p === "buy" ? "Buy" : "Rent"}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className={`${BTN} w-full lg:w-40 lg:self-end`}>
          Search
        </button>
      </div>

      <div className="mt-5">
        <p className={LABEL}>Bedrooms</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {BEDS.map((b) => (
            <button key={b.id} type="button" aria-pressed={f.bedrooms.includes(b.id)} onClick={() => set({ bedrooms: toggleIn(f.bedrooms, b.id) })} className={`${CHIP} min-w-14 ${f.bedrooms.includes(b.id) ? CHIP_ON : CHIP_OFF}`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <details className="group mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-neutral-800">
          More filters
          <span aria-hidden="true" className="text-neutral-500 group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 grid gap-5">
          <div>
            <p className={LABEL}>Property type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t.id} type="button" aria-pressed={f.propertyTypes.includes(t.id)} onClick={() => set({ propertyTypes: toggleIn(f.propertyTypes, t.id) })} className={`${CHIP} ${f.propertyTypes.includes(t.id) ? CHIP_ON : CHIP_OFF}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Minimum price (AED)</span>
              <input inputMode="numeric" value={f.minPrice ?? ""} onChange={(e) => set({ minPrice: numberOrNull(e.target.value) })} placeholder="No minimum" className={`${FIELD} mt-1`} />
            </label>
            <label className="block">
              <span className={LABEL}>Maximum price (AED)</span>
              <input inputMode="numeric" value={f.maxPrice ?? ""} onChange={(e) => set({ maxPrice: numberOrNull(e.target.value) })} placeholder="No maximum" className={`${FIELD} mt-1`} />
            </label>
            <label className="block">
              <span className={LABEL}>Minimum size (sq ft)</span>
              <input inputMode="numeric" value={f.minArea ?? ""} onChange={(e) => set({ minArea: numberOrNull(e.target.value) })} placeholder="Any" className={`${FIELD} mt-1`} />
            </label>
            <label className="block">
              <span className={LABEL}>Maximum size (sq ft)</span>
              <input inputMode="numeric" value={f.maxArea ?? ""} onChange={(e) => set({ maxArea: numberOrNull(e.target.value) })} placeholder="Any" className={`${FIELD} mt-1`} />
            </label>
            <label className="block">
              <span className={LABEL}>Status</span>
              <select value={f.completion} onChange={(e) => set({ completion: e.target.value as SearchFilters["completion"] })} className={`${FIELD} mt-1`}>
                <option value="any">Ready or off-plan</option>
                <option value="ready">Ready</option>
                <option value="off-plan">Off-plan</option>
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Furnishing</span>
              <select value={f.furnished} onChange={(e) => set({ furnished: e.target.value as SearchFilters["furnished"] })} className={`${FIELD} mt-1`}>
                <option value="any">Any</option>
                <option value="furnished">Furnished</option>
                <option value="unfurnished">Unfurnished</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend className={LABEL}>Search these sources</legend>
            <p className="mt-1 text-xs text-neutral-500">Leave all unticked to search every source.</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {SOURCES.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-3 text-sm text-neutral-800">
                  <input type="checkbox" className="size-5 accent-neutral-900" checked={f.sources.includes(s.id as SourceId)} onChange={() => set({ sources: toggleIn(f.sources, s.id as SourceId) })} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </details>
    </form>
  );
}
