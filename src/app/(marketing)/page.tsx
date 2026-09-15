import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DeveloperCard } from "@/components/developer-card";
import { GeoFilters } from "@/components/geo-filters";
import { StatCounter } from "@/components/stat-counter";
import { LoginConversionPrompt } from "@/components/login-conversion-prompt";
import { ContinueResearch } from "@/components/continue-research";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicHomepageData, selectInitialHomepageDevelopers } from "@/lib/developer-connect/search-service";
import { getRecentlyViewedDevelopers } from "@/lib/developer-connect/recently-viewed";
import { readSessionId } from "@/lib/session";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const resolvedSearchParams = await searchParams;
  const query = firstValue(resolvedSearchParams.q);
  const country = firstValue(resolvedSearchParams.country);
  const state = firstValue(resolvedSearchParams.state);
  const city = firstValue(resolvedSearchParams.city);
  const hasActiveFilter = Boolean(query || country || state || city);

  const repos = createPostgresRepositories();
  const { directory, geographyOptions, stats } = await getPublicHomepageData(repos, {
    query,
    country,
    state,
    city,
  });

  // Anonymous, no-filter "initial discovery" only ever narrows THIS
  // default view — search, filters, and signed-in visitors always reach
  // the full published directory (see selectInitialHomepageDevelopers).
  // Does not touch `stats`, which always reflects the real, complete
  // dataset regardless of what's shown below it.
  const { userId } = await auth();
  const isInitialDiscovery = !userId && !hasActiveFilter;
  const sessionId = await readSessionId();
  const visibleDirectory = isInitialDiscovery
    ? selectInitialHomepageDevelopers(directory, sessionId ?? randomUUID())
    : directory;
  const isLimitedView = isInitialDiscovery && visibleDirectory.length < directory.length;

  // "Continue your research" (Part 8/9) — only on the plain, unfiltered
  // landing view; a visitor actively searching/filtering is already mid-
  // research, not returning to resume it. Real data only — no entry for
  // a visitor with no view history yet (see ContinueResearch).
  const recentlyViewed = hasActiveFilter
    ? []
    : await getRecentlyViewedDevelopers(repos, { userId: userId ?? undefined, sessionId: sessionId ?? undefined });

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Find the developer. Go directly to the source.
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Verified developer websites. Skip the broker search.
            </p>

            <div className="mt-8">
              <SearchBox />
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-3xl sm:mt-20">
            <div className="grid grid-cols-3 gap-4 text-center sm:gap-8">
              <StatCounter value={stats.verifiedDevelopers} label="Verified developers" />
              <StatCounter value={stats.officialWebsitesVerified} label="Official websites verified" />
              <StatCounter value={stats.citiesCovered} label="Markets covered" />
            </div>
          </div>

          <ContinueResearch developers={recentlyViewed} />

          <div className="mx-auto mt-12 max-w-5xl sm:mt-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Verified developers
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every developer listed here has an official website verified by Developer
                  Connects.
                </p>
              </div>
              <GeoFilters options={geographyOptions} selected={{ country, state, city }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Looking for developers in a specific location? Use the filters above for quick
              navigation.
            </p>

            {visibleDirectory.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
                <p className="font-medium text-foreground">
                  {hasActiveFilter ? "No verified developers match these filters." : "No verified developers yet."}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {hasActiveFilter
                    ? "Try a different country, state, or city."
                    : "Developer Connects is starting in Mumbai and adding verified developers over time."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid items-stretch gap-4 sm:grid-cols-2">
                  {visibleDirectory.map((developer) => (
                    <DeveloperCard key={developer.id} developer={developer} />
                  ))}
                </div>
                {isLimitedView && (
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Showing {visibleDirectory.length} of {directory.length} verified developers.{" "}
                    Search, use filters, or sign in to see the full directory.
                  </p>
                )}
              </>
            )}
          </div>
        </Container>
      </main>

      <SiteFooter />
      {!userId && <LoginConversionPrompt />}
    </div>
  );
}
