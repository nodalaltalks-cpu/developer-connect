"use client";

import { classifyPair, DUPLICATE_NOTICE } from "../lib/duplicates.ts";
import { aed, bedroomsLabel, pricePerSqft } from "../lib/format.ts";
import { sourceName } from "../lib/sources.ts";
import type { Listing } from "../lib/types.ts";
import { BTN, BTN_QUIET } from "./ui.ts";

interface Row {
  label: string;
  value: (l: Listing) => string;
  /** Numeric value used to mark the best (lowest) figure, when lower is better. */
  best?: (l: Listing) => number | null;
}

const ROWS: Row[] = [
  { label: "Source", value: (l) => sourceName(l.source, l.sourceLabel) },
  { label: "Asking price", value: (l) => aed(l.priceAed), best: (l) => l.priceAed },
  { label: "Price per sq ft", value: (l) => (pricePerSqft(l) ? `AED ${pricePerSqft(l)!.toLocaleString("en-US")}` : "—"), best: (l) => pricePerSqft(l) },
  { label: "Area", value: (l) => (l.areaSqft ? `${l.areaSqft.toLocaleString("en-US")} sq ft` : "—") },
  { label: "Bedrooms", value: (l) => bedroomsLabel(l.bedrooms) },
  { label: "Bathrooms", value: (l) => (l.bathrooms === null ? "—" : String(l.bathrooms)) },
  { label: "Building", value: (l) => l.building ?? "—" },
  { label: "Unit", value: (l) => l.unit ?? "Not shown" },
  { label: "Floor", value: (l) => (l.floor === null ? "Not shown" : String(l.floor)) },
  { label: "Status", value: (l) => (l.completion === "ready" ? "Ready" : l.completion === "off-plan" ? "Off-plan" : "—") },
  { label: "Furnishing", value: (l) => (l.furnished === null ? "—" : l.furnished ? "Furnished" : "Unfurnished") },
  { label: "Permit number (advertiser's claim, not checked)", value: (l) => l.permitNumber ?? "None shown" },
  { label: "Last recorded", value: (l) => new Date(l.lastCheckedAt).toLocaleDateString("en-GB") },
];

export function CompareView({ listings, onClose, onRemove, onOpenOriginal }: { listings: Listing[]; onClose: () => void; onRemove: (id: string) => void; onOpenOriginal: (l: Listing) => void }) {
  const pair = listings.length === 2 ? classifyPair(listings[0], listings[1]) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Compare properties" className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-900">Compare advertisements</h2>
          <button type="button" className={BTN_QUIET} onClick={onClose} autoFocus>
            Close
          </button>
        </div>

        {pair && (
          <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
            <strong className="text-neutral-900">
              {pair.kind === "confirmed" ? "Same property" : pair.kind === "probable" ? "Possibly the same property" : "Treated as different properties"}.
            </strong>{" "}
            {pair.reasons.join(" ")} {DUPLICATE_NOTICE}
          </p>
        )}

        <div className="mt-5 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-neutral-50">
                <th scope="col" className="w-40 p-3 font-medium text-neutral-500">
                  <span className="sr-only">Detail</span>
                </th>
                {listings.map((l) => (
                  <th key={l.id} scope="col" className="p-3 align-top font-semibold text-neutral-900">
                    <span className="block">{l.title}</span>
                    <button type="button" className="mt-1 min-h-11 text-xs font-medium text-neutral-500 underline" onClick={() => onRemove(l.id)}>
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const numbers = row.best ? listings.map((l) => row.best!(l)) : [];
                const valid = numbers.filter((n): n is number => n !== null);
                const lowest = valid.length > 1 ? Math.min(...valid) : null;
                return (
                  <tr key={row.label} className="border-t border-neutral-100">
                    <th scope="row" className="p-3 font-medium text-neutral-500">
                      {row.label}
                    </th>
                    {listings.map((l, i) => (
                      <td key={l.id} className={`p-3 text-neutral-900 [font-variant-numeric:tabular-nums] ${lowest !== null && numbers[i] === lowest ? "font-semibold text-emerald-800" : ""}`}>
                        {row.value(l)}
                        {lowest !== null && numbers[i] === lowest && <span className="ml-1 text-xs font-normal">lowest</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-neutral-100">
                <th scope="row" className="p-3 font-medium text-neutral-500">
                  Original advertisement
                </th>
                {listings.map((l) => (
                  <td key={l.id} className="p-3">
                    <button type="button" className={BTN} onClick={() => onOpenOriginal(l)}>
                      View original ↗
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-neutral-500">A listing marked “lowest” is only the lowest asking figure here. It does not mean it is the best choice or still available.</p>
      </div>
    </div>
  );
}
