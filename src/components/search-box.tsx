"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { searchDevelopers, recordSearchResultClick } from "@/app/_actions/public-actions";
import { VerifiedBadge } from "@/components/verified-badge";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";

const DEBOUNCE_MS = 300;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "results"; results: PublicDeveloperProfile[] }
  | { status: "empty" }
  | { status: "error" };

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const inputId = useId();
  const statusId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The visitor's already-selected Country/State/City (set by GeoFilters,
  // stored in the URL) — read here too so search results refine the same
  // way the directory grid below does, instead of search silently
  // ignoring whatever location is already selected.
  const geo = {
    country: searchParams.get("country") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    city: searchParams.get("city") ?? undefined,
  };
  const hasActiveFilter = Boolean(geo.country || geo.state || geo.city);

  function clearFilters() {
    router.push(pathname);
  }

  function runSearch(trimmed: string) {
    if (!trimmed) {
      requestIdRef.current += 1;
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const requestId = ++requestIdRef.current;

    startTransition(async () => {
      try {
        const results = await searchDevelopers(trimmed, geo);
        if (requestId !== requestIdRef.current) return; // a newer keystroke already superseded this
        setState(results.length > 0 ? { status: "results", results } : { status: "empty" });
      } catch {
        if (requestId !== requestIdRef.current) return;
        setState({ status: "error" });
      }
    });
  }

  // Re-run the CURRENT query, unchanged, whenever the visitor changes
  // Country/State/City (including via this component's own "Clear
  // filters" link) — without this, a query typed while a filter was
  // active would keep showing that stale result set even after the
  // filter driving it no longer applies.
  const isFirstGeoRun = useRef(true);
  useEffect(() => {
    if (isFirstGeoRun.current) {
      isFirstGeoRun.current = false;
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    runSearch(query.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally NOT keyed on `query`: this re-runs on geo change only, using whatever query is current at that moment.
  }, [geo.country, geo.state, geo.city]);

  function handleChange(value: string) {
    setQuery(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      requestIdRef.current += 1;
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    timeoutRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
  }

  return (
    <form role="search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={inputId} className="sr-only">
        Search a developer
      </label>
      <input
        id={inputId}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Search a developer"
        aria-describedby={statusId}
        className="w-full min-h-11 rounded-lg border border-border bg-background px-5 py-4 text-lg text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div id={statusId} aria-live="polite" className="mt-3">
        {state.status === "loading" && <SearchSkeleton />}

        {state.status === "error" && (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Something went wrong. Please try searching again.
          </p>
        )}

        {state.status === "empty" && (
          <ZeroResultState query={query.trim()} hasActiveFilter={hasActiveFilter} onClearFilters={clearFilters} />
        )}

        {state.status === "results" && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {state.results.map((developer, index) => (
              <li key={developer.id}>
                <Link
                  href={`/developers/${developer.slug}?q=${encodeURIComponent(query.trim())}`}
                  onClick={() => {
                    void recordSearchResultClick(developer.id, query.trim(), index);
                  }}
                  className="flex min-h-11 items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {developer.displayName}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {developer.city}, {developer.state}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <VerifiedBadge />
                      {developer.officialWebsite && (
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {developer.officialWebsite.canonicalDomain}
                        </span>
                      )}
                    </span>
                  </span>
                  <span aria-hidden="true" className="mt-1 shrink-0 text-muted-foreground">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border p-5">
      <span className="sr-only">Searching…</span>
      <div aria-hidden="true" className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div aria-hidden="true" className="h-4 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

function ZeroResultState({
  query,
  hasActiveFilter,
  onClearFilters,
}: {
  query: string;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted p-5 text-sm">
      <p className="font-medium text-foreground">
        No verified developer found for &ldquo;{query}&rdquo;
        {hasActiveFilter ? " in this location." : "."}
      </p>
      <p className="mt-1 text-muted-foreground">
        {hasActiveFilter
          ? "Try another search, or clear filters to search everywhere."
          : "Developer Connects is starting in Mumbai and adding verified developers over time."}
      </p>
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-2 text-sm font-medium text-accent-hover hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
