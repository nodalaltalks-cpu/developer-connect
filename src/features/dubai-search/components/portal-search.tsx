"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "../lib/analytics.ts";
import { COMMUNITIES, communityLabel, getCommunity } from "../lib/communities.ts";
import { pagePath, intentSlug } from "../lib/intents.ts";
import { type Kind, type Purpose, portalLinks, PORTAL_NOTICE, supportsKind } from "../lib/portals.ts";
import { PortalButton } from "./portal-button.tsx";
import { BTN_QUIET, CHIP, CHIP_OFF, CHIP_ON, FIELD, LABEL } from "./ui.ts";
import Link from "next/link";

const BEDS: Array<{ id: number | null; label: string }> = [
  { id: null, label: "Any" },
  { id: 0, label: "Studio" },
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
];

/**
 * The search box. Pick the area, buy or rent, type and bedrooms, and the same search is ready on every portal. Nothing is
 * fetched: each button is a link to the portal's own results page.
 */
export function PortalSearch({ initialCommunity = "jumeirah-village-circle", initialPurpose = "buy" }: { initialCommunity?: string; initialPurpose?: Purpose }) {
  const [communityId, setCommunityId] = useState(initialCommunity);
  const [purpose, setPurpose] = useState<Purpose>(initialPurpose);
  const [kind, setKind] = useState<Kind>("apartments");
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const community = getCommunity(communityId) ?? COMMUNITIES[0];

  useEffect(() => {
    // A type the new area does not offer falls back to apartments.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the choice valid when the area changes
    if (!supportsKind(community, kind)) setKind("apartments");
  }, [community, kind]);

  const links = useMemo(() => portalLinks({ community, purpose, kind, bedrooms }), [community, purpose, kind, bedrooms]);
  const pageHref = pagePath(community.id, intentSlug(purpose, kind, kind === "apartments" ? bedrooms : null));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSearched(true);
        track("search_submit", community.id);
      }}
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6"
      aria-label="Search Dubai property across portals"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className={LABEL}>Where in Dubai?</span>
          <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className={`${FIELD} mt-1`}>
            <optgroup label="Most searched">
              {COMMUNITIES.filter((c) => c.popular).map((c) => (
                <option key={c.id} value={c.id}>
                  {communityLabel(c)}
                </option>
              ))}
            </optgroup>
            <optgroup label="All Dubai areas, A to Z">
              {[...COMMUNITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>
                  {communityLabel(c)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div role="group" aria-label="Buy or rent" className="flex items-end gap-2">
          {(["buy", "rent"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)} className={`${CHIP} flex-1 sm:flex-none ${purpose === p ? CHIP_ON : CHIP_OFF}`}>
              {p === "buy" ? "Buy" : "Rent"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className={LABEL}>Property type</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["apartments", "villas", "townhouses"] as const)
            .filter((k) => supportsKind(community, k))
            .map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`${CHIP} capitalize ${kind === k ? CHIP_ON : CHIP_OFF}`}>
                {k}
              </button>
            ))}
        </div>
      </div>

      {kind === "apartments" && (
        <div className="mt-5">
          <p className={LABEL}>Bedrooms</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BEDS.map((b) => (
              <button key={String(b.id)} type="button" aria-pressed={bedrooms === b.id} onClick={() => setBedrooms(b.id)} className={`${CHIP} min-w-14 ${bedrooms === b.id ? CHIP_ON : CHIP_OFF}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="submit" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 sm:w-auto">
        Search all portals
      </button>

      <div aria-live="polite" className={searched ? "mt-6" : "mt-6 hidden sm:block"}>
        <p className="text-sm font-semibold text-neutral-900">Your search is ready on each website:</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {links.map((l) => (
            <PortalButton key={l.id} link={l} page={pageHref} primary={l.id !== "dubizzle"} />
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-neutral-500">{PORTAL_NOTICE}</p>
        <Link href={pageHref} className={`${BTN_QUIET} mt-3`}>
          Read the guide to this search →
        </Link>
      </div>
    </form>
  );
}
