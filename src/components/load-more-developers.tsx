"use client";

import { useState, useTransition } from "react";
import { DeveloperCard } from "@/components/developer-card";
import { Button } from "@/components/ui/button";
import { loadMoreDirectoryDevelopers } from "@/app/_actions/public-actions";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";

/**
 * "Load more" for the homepage directory. The page server-renders only the
 * first page of cards; this appends each further page, fetched for the
 * SAME query/Country/State/City, beneath them in the same grid layout.
 *
 * `renderedIds` are the developers the server already rendered — anything
 * already on screen is never shown twice, even if the directory changed
 * between page loads.
 */
export function LoadMoreDevelopers({
  filter,
  renderedIds,
  total,
}: {
  filter: { query?: string; country?: string; state?: string; city?: string };
  renderedIds: string[];
  total: number;
}) {
  const [appended, setAppended] = useState<PublicDeveloperProfile[]>([]);
  const [loadedCount, setLoadedCount] = useState(renderedIds.length);
  const [latestTotal, setLatestTotal] = useState(total);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shownCount = renderedIds.length + appended.length;
  const hasMore = loadedCount < latestTotal;

  function loadMore() {
    setFailed(false);
    startTransition(async () => {
      try {
        const page = await loadMoreDirectoryDevelopers(filter, loadedCount);
        const seen = new Set([...renderedIds, ...appended.map((d) => d.id)]);
        setAppended((current) => [...current, ...page.developers.filter((d) => !seen.has(d.id))]);
        setLoadedCount((count) => count + page.developers.length);
        // An empty page means there is nothing further to load, whatever the earlier total said.
        setLatestTotal(page.developers.length === 0 ? loadedCount : page.total);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <>
      {appended.length > 0 && (
        <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-2">
          {appended.map((developer) => (
            <DeveloperCard key={developer.id} developer={developer} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {shownCount} of {Math.max(latestTotal, shownCount)} verified developers.
        </p>
        {hasMore && (
          <Button variant="secondary" onClick={loadMore} disabled={isPending}>
            {isPending ? "Loading…" : "Load more"}
          </Button>
        )}
        {failed && (
          <p className="text-sm text-muted-foreground" role="alert">
            Couldn&apos;t load more developers. Please try again.
          </p>
        )}
      </div>
    </>
  );
}
