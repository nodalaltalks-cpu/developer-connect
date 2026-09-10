"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
    const requestId = ++requestIdRef.current;

    timeoutRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const results = await searchDevelopers(trimmed);
          if (requestId !== requestIdRef.current) return; // a newer keystroke already superseded this
          setState(results.length > 0 ? { status: "results", results } : { status: "empty" });
        } catch {
          if (requestId !== requestIdRef.current) return;
          setState({ status: "error" });
        }
      });
    }, DEBOUNCE_MS);
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

        {state.status === "empty" && <ZeroResultState query={query.trim()} />}

        {state.status === "results" && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {state.results.map((developer, index) => (
              <li key={developer.id}>
                <Link
                  href={`/developers/${developer.slug}?q=${encodeURIComponent(query.trim())}`}
                  onClick={() => {
                    void recordSearchResultClick(developer.id, query.trim(), index);
                  }}
                  className="flex min-h-11 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span>
                    <span className="block font-medium text-foreground">
                      {developer.displayName}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {developer.city}, {developer.state}
                    </span>
                  </span>
                  <VerifiedBadge />
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
    <div
      className="space-y-3 rounded-lg border border-border p-5"
      aria-hidden="true"
    >
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

function ZeroResultState({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-5 text-sm">
      <p className="font-medium text-foreground">
        No verified developer found for &ldquo;{query}&rdquo;.
      </p>
      <p className="mt-1 text-muted-foreground">
        Developer Connect is starting in Mumbai and adding verified developers over time.
      </p>
    </div>
  );
}
