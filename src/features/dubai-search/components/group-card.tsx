"use client";

import { useState } from "react";
import { DUPLICATE_NOTICE } from "../lib/duplicates.ts";
import { aed, bedroomsLabel, priceGapLabel, pricePerSqft } from "../lib/format.ts";
import { sourceName } from "../lib/sources.ts";
import { trustIndicators } from "../lib/trust.ts";
import type { Listing, ListingGroup } from "../lib/types.ts";
import { BTN, BTN_QUIET } from "./ui.ts";

interface Props {
  group: ListingGroup;
  now: Date;
  saved: string[];
  compare: string[];
  onToggleSave: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onOpenOriginal: (listing: Listing) => void;
  onViewed: (id: string) => void;
}

const KIND_LABEL = { confirmed: "Same property, advertised more than once", probable: "Possibly the same property" } as const;

export function GroupCard({ group, now, saved, compare, onToggleSave, onToggleCompare, onOpenOriginal, onViewed }: Props) {
  const lead = group.members[0];
  const gap = priceGapLabel(group.minPrice, group.maxPrice);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 p-4 sm:p-5">
        {group.kind !== "single" && (
          <p className={`mb-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${group.kind === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {KIND_LABEL[group.kind]} · {group.members.length} sources
          </p>
        )}
        <h3 className="text-lg font-semibold leading-snug text-neutral-900">{lead.title}</h3>
        <p className="mt-1 text-sm text-neutral-600">
          {lead.community}
          {lead.building ? ` · ${lead.building}` : ""}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-700">
          <div><dt className="sr-only">Bedrooms</dt><dd>{bedroomsLabel(lead.bedrooms)}</dd></div>
          {lead.bathrooms !== null && <div><dt className="sr-only">Bathrooms</dt><dd>{lead.bathrooms} bath</dd></div>}
          {lead.areaSqft !== null && <div><dt className="sr-only">Area</dt><dd>{lead.areaSqft.toLocaleString("en-US")} sq ft</dd></div>}
          <div><dt className="sr-only">Type</dt><dd className="capitalize">{lead.propertyType}</dd></div>
          {lead.completion && <div><dt className="sr-only">Status</dt><dd>{lead.completion === "ready" ? "Ready" : "Off-plan"}</dd></div>}
          {lead.floor !== null && <div><dt className="sr-only">Floor</dt><dd>Floor {lead.floor}</dd></div>}
        </dl>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 [font-variant-numeric:tabular-nums]">
          {group.minPrice === group.maxPrice ? aed(group.minPrice) : `${aed(group.minPrice)} – ${aed(group.maxPrice)}`}
          {lead.purpose === "rent" && <span className="text-sm font-normal text-neutral-500"> / year</span>}
        </p>
        {gap && <p className="mt-1 text-sm text-neutral-600">{gap}.</p>}
        {group.kind !== "single" && (
          <p className="mt-2 text-xs leading-5 text-neutral-500">
            {group.reasons.join(" ")} {DUPLICATE_NOTICE}
          </p>
        )}
      </div>

      <ul className="divide-y divide-neutral-100">
        {group.members.map((m) => {
          const psf = pricePerSqft(m);
          return (
            <li key={m.id} className="p-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{sourceName(m.source, m.sourceLabel)}</p>
                  <p className="text-sm text-neutral-600 [font-variant-numeric:tabular-nums]">
                    {aed(m.priceAed)}
                    {psf ? ` · AED ${psf.toLocaleString("en-US")}/sq ft` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BTN_QUIET} aria-pressed={compare.includes(m.id)} onClick={() => onToggleCompare(m.id)}>
                    {compare.includes(m.id) ? "✓ In compare" : "Compare"}
                  </button>
                  <button type="button" className={BTN_QUIET} aria-pressed={saved.includes(m.id)} onClick={() => onToggleSave(m.id)}>
                    {saved.includes(m.id) ? "Saved ✓" : "Save"}
                  </button>
                  <button
                    type="button"
                    className={BTN_QUIET}
                    aria-expanded={open === m.id}
                    onClick={() => {
                      setOpen(open === m.id ? null : m.id);
                      onViewed(m.id);
                    }}
                  >
                    Details
                  </button>
                  <button type="button" className={BTN} onClick={() => onOpenOriginal(m)}>
                    View original ↗
                  </button>
                </div>
              </div>
              {open === m.id && (
                <ul className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3 text-sm">
                  {trustIndicators(m, now).map((t) => (
                    <li key={t.key}>
                      <p className="font-medium text-neutral-900">{t.label}</p>
                      <p className="text-neutral-600">{t.explain}</p>
                    </li>
                  ))}
                  <li className="text-xs text-neutral-500">
                    First recorded {new Date(m.discoveredAt).toLocaleDateString("en-GB")}. Last recorded {new Date(m.lastCheckedAt).toLocaleDateString("en-GB")}.
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
