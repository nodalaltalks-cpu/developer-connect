"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { summariseEvents, track, type StoredEvent } from "../lib/analytics.ts";
import { DEMO_LABEL, DEMO_LISTINGS } from "../lib/demo-data.ts";
import { groupListings } from "../lib/duplicates.ts";
import { aed } from "../lib/format.ts";
import { filterListings, sortGroups } from "../lib/search.ts";
import { sourceName } from "../lib/sources.ts";
import { addSearch, describeFilters, LIMITS, mergeUserListings, pushRecent, readJson, toggle, writeJson, type SavedSearch } from "../lib/storage.ts";
import { DEFAULT_FILTERS, type Listing, type SearchFilters, type SortKey } from "../lib/types.ts";
import { AddListings } from "./add-listings.tsx";
import { CompareView } from "./compare-view.tsx";
import { GroupCard } from "./group-card.tsx";
import { SearchForm } from "./search-form.tsx";
import { SourcesPanel } from "./sources-panel.tsx";
import { BTN, BTN_QUIET, CARD, FIELD } from "./ui.ts";

const PAGE = 12;
const MAX_COMPARE = 4;

function usedFilters(f: SearchFilters): string {
  const used: string[] = [];
  if (f.bedrooms.length) used.push("bedrooms");
  if (f.minPrice !== null || f.maxPrice !== null) used.push("price");
  if (f.minArea !== null || f.maxArea !== null) used.push("size");
  if (f.completion !== "any") used.push("status");
  if (f.furnished !== "any") used.push("furnishing");
  if (f.sources.length) used.push("sources");
  if (f.propertyTypes.length !== 1 || f.propertyTypes[0] !== "apartment") used.push("type");
  return used.join(",");
}

export function DubaiSearchApp() {
  const [applied, setApplied] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [formKey, setFormKey] = useState(0);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(() => new Date("2026-11-20T12:00:00Z"));
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [history, setHistory] = useState<SearchFilters[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState<Listing | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);

  // What the visitor kept lives only in this browser, so it can be read only after the page loads.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-only storage and clock */
    setNow(new Date());
    setUserListings(readJson<Listing[]>("userListings", []));
    setSaved(readJson<string[]>("saved", []));
    setSavedSearches(readJson<SavedSearch[]>("searches", []));
    setHistory(readJson<SearchFilters[]>("history", []));
    setRecent(readJson<string[]>("recent", []));
    track("visit");
    setEvents(readJson<StoredEvent[]>("events", []));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const all = useMemo<Listing[]>(() => [...DEMO_LISTINGS, ...userListings], [userListings]);
  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const groups = useMemo(() => sortGroups(groupListings(filterListings(all, applied)), sort), [all, applied, sort]);
  const advertisementCount = groups.reduce((n, g) => n + g.members.length, 0);
  const compareListings = compare.map((id) => byId.get(id)).filter((l): l is Listing => !!l);
  const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter((l): l is Listing => !!l);
  const refreshEvents = () => setEvents(readJson<StoredEvent[]>("events", []));
  const hasDemo = groups.some((g) => g.members.some((m) => m.isDemo)) || groups.length === 0;

  function search(f: SearchFilters) {
    setApplied(f);
    setShown(PAGE);
    const nextHistory = [f, ...history.filter((h) => JSON.stringify(h) !== JSON.stringify(f))].slice(0, LIMITS.history);
    setHistory(nextHistory);
    writeJson("history", nextHistory);
    track("search_submit");
    const used = usedFilters(f);
    if (used) track("filter_used", used);
    refreshEvents();
  }

  function toggleSave(id: string) {
    const next = toggle(saved, id, LIMITS.saved);
    setSaved(next);
    writeJson("saved", next);
    if (next.includes(id)) track("property_saved");
    refreshEvents();
  }

  function toggleCompare(id: string) {
    setCompare((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE) return cur;
      track("compare_added");
      return [...cur, id];
    });
  }

  function viewed(id: string) {
    const next = pushRecent(recent, id, LIMITS.recent);
    setRecent(next);
    writeJson("recent", next);
    track("result_opened");
    refreshEvents();
  }

  function openOriginal(l: Listing) {
    track("source_outbound_click", l.source);
    refreshEvents();
    if (l.isDemo) setDemoOpen(l);
    else window.open(l.url, "_blank", "noopener,noreferrer");
  }

  function saveSearch() {
    const next = addSearch(savedSearches, applied, new Date().toISOString(), LIMITS.searches);
    setSavedSearches(next);
    writeJson("searches", next);
    track("search_saved");
    refreshEvents();
  }

  function addListings(added: Listing[], how: "url" | "csv") {
    const next = mergeUserListings(userListings, added, LIMITS.userListings);
    setUserListings(next);
    writeJson("userListings", next);
    track(how === "csv" ? "csv_imported" : "listing_added");
    refreshEvents();
  }

  function applySaved(f: SearchFilters) {
    setFormKey((k) => k + 1);
    setApplied(f);
    setShown(PAGE);
  }

  const summary = summariseEvents(events);
  const savedListings = resolve(saved);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-neutral-600 hover:text-neutral-900">
            ← Developer Connects
          </Link>
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">EXPERIMENT</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-48 pt-8 sm:pb-32 sm:px-6 sm:pt-12">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Dubai Property Search</p>
          <h1 className="mt-2 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">One search. Multiple property websites. Better property discovery.</h1>
          <p className="mt-4 max-w-2xl text-base text-neutral-600">
            Search once, compare the same property across sources, then open the original advertisement. Free for everyone: no sign-in, no fees, no sponsored results, and nothing ranks higher for payment.
          </p>
        </section>

        <p role="note" className="mt-6 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          {DEMO_LABEL}. Every property below is made up so you can try the full search and comparison flow. Nothing links to a real advertisement.
        </p>

        <div className="mt-6">
          <SearchForm key={formKey} value={applied} onSearch={search} />
        </div>

        <section className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {groups.length} {groups.length === 1 ? "property" : "properties"}
              </h2>
              <p className="text-sm text-neutral-600">
                {advertisementCount} advertisement{advertisementCount === 1 ? "" : "s"} · {describeFilters(applied)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${FIELD} w-auto`}>
                  <option value="relevance">Most sources first</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="size-desc">Size: largest first</option>
                  <option value="fresh">Recently checked</option>
                </select>
              </label>
              <button type="button" className={BTN_QUIET} onClick={saveSearch}>
                Save this search
              </button>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className={`${CARD} mt-5 p-8 text-center`}>
              <p className="text-base font-semibold">No properties match.</p>
              <p className="mt-1 text-sm text-neutral-600">Try a wider budget, fewer filters, or tick fewer sources. The demonstration data covers Jumeirah Village Circle best.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {groups.slice(0, shown).map((g) => (
                <GroupCard key={g.id} group={g} now={now} saved={saved} compare={compare} onToggleSave={toggleSave} onToggleCompare={toggleCompare} onOpenOriginal={openOriginal} onViewed={viewed} />
              ))}
              {groups.length > shown && (
                <button type="button" className={`${BTN_QUIET} mx-auto`} onClick={() => setShown(shown + PAGE)}>
                  Show more ({groups.length - shown} left)
                </button>
              )}
            </div>
          )}
          {hasDemo && <p className="mt-4 text-xs text-neutral-500">{DEMO_LABEL}</p>}
        </section>

        <section className="mt-12 grid gap-3" aria-label="Your activity">
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Saved properties ({savedListings.length})</summary>
            {savedListings.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">Nothing saved yet. Use Save on any advertisement.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {savedListings.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>
                      <span className="font-medium">{l.title}</span> · {aed(l.priceAed)} · {sourceName(l.source, l.sourceLabel)}
                    </span>
                    <span className="flex gap-2">
                      <button type="button" className={BTN_QUIET} onClick={() => openOriginal(l)}>View original ↗</button>
                      <button type="button" className={BTN_QUIET} onClick={() => toggleSave(l.id)}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Saved searches ({savedSearches.length})</summary>
            {savedSearches.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">No saved searches. Use “Save this search” above the results.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {savedSearches.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>{describeFilters(s.filters)}</span>
                    <span className="flex gap-2">
                      <button type="button" className={BTN_QUIET} onClick={() => applySaved(s.filters)}>Run</button>
                      <button
                        type="button"
                        className={BTN_QUIET}
                        onClick={() => {
                          const next = savedSearches.filter((x) => x.id !== s.id);
                          setSavedSearches(next);
                          writeJson("searches", next);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Search history ({history.length})</summary>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">Your recent searches appear here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>{describeFilters(h)}</span>
                    <button type="button" className={BTN_QUIET} onClick={() => applySaved(h)}>Search again</button>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Recently viewed ({recent.length})</summary>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">Open Details on an advertisement and it appears here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {resolve(recent).map((l) => (
                  <li key={l.id} className="py-3 text-sm">
                    <span className="font-medium">{l.title}</span> · {aed(l.priceAed)} · {sourceName(l.source, l.sourceLabel)}
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Add your own listings</summary>
            <div className="mt-4">
              <AddListings onAdd={addListings} />
            </div>
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Sources: what is and is not connected</summary>
            <div className="mt-4">
              <SourcesPanel />
            </div>
          </details>
          <details className={`${CARD} p-4`}>
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">Usage on this device (experiment analytics)</summary>
            <p className="mt-2 text-sm text-neutral-600">Recorded only in this browser. Not sent anywhere and not connected to any analytics service.</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-neutral-500">Visits</dt><dd className="font-semibold">{summary.visits}</dd></div>
              <div><dt className="text-neutral-500">Days returned</dt><dd className="font-semibold">{summary.returningDays}</dd></div>
              {Object.entries(summary.counts).filter(([k]) => k !== "visit").map(([k, v]) => (
                <div key={k}><dt className="text-neutral-500">{k.replace(/_/g, " ")}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
          </details>
        </section>

        <p className="mt-10 max-w-3xl text-xs leading-5 text-neutral-500">
          Developer Connects does not own, sell, rent or represent any advertisement shown here, and earns nothing from this search. Always confirm the unit, the price, the advertising permit and availability with the advertiser, and use official Dubai services to check ownership and title before you pay anything.
        </p>
      </main>

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-[5.25rem] z-40 border-t border-neutral-200 bg-white/95 p-3 backdrop-blur sm:bottom-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm font-medium">{compare.length} selected to compare (max {MAX_COMPARE})</p>
            <div className="flex gap-2">
              <button type="button" className={BTN_QUIET} onClick={() => setCompare([])}>Clear</button>
              <button
                type="button"
                className={BTN}
                disabled={compare.length < 2}
                onClick={() => {
                  setCompareOpen(true);
                  track("compare_opened");
                  refreshEvents();
                }}
              >
                Compare {compare.length < 2 ? "(pick 2+)" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {compareOpen && compareListings.length >= 2 && (
        <CompareView listings={compareListings} onClose={() => setCompareOpen(false)} onRemove={(id) => {
            if (compareListings.length <= 2) setCompareOpen(false);
            toggleCompare(id);
          }} onOpenOriginal={openOriginal} />
      )}

      {demoOpen && (
        <div role="dialog" aria-modal="true" aria-label="Demonstration listing" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">{DEMO_LABEL}</p>
            <h2 className="mt-2 text-lg font-semibold">This is a made-up listing</h2>
            <p className="mt-2 text-sm text-neutral-600">
              With real data, this button opens the original advertisement on {sourceName(demoOpen.source, demoOpen.sourceLabel)} in a new tab, so you can confirm the unit, price and availability with the advertiser.
            </p>
            <button type="button" className={`${BTN} mt-5 w-full`} onClick={() => setDemoOpen(null)} autoFocus>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
