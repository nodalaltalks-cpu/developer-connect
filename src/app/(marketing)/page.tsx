import { randomUUID } from "node:crypto";
import { SHARE_IMAGES } from "@/lib/share-image";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DeveloperCard } from "@/components/developer-card";
import { GeoFilters } from "@/components/geo-filters";
import { StatCounter } from "@/components/stat-counter";
import { CountriesCoveredCard } from "@/components/countries-covered-card";
import { HeroVideo } from "@/components/hero-video";
import { LoginConversionPrompt } from "@/components/login-conversion-prompt";
import { ContinueResearch } from "@/components/continue-research";
import { BuyerJourney } from "@/components/buyer-journey";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { DIRECTORY_PAGE_SIZE, getPublicHomepageData } from "@/lib/developer-connect/search-service";
import { getRecentlyViewedDevelopers } from "@/lib/developer-connect/recently-viewed";
import { readSessionId } from "@/lib/session";
import { LoadMoreDevelopers } from "@/components/load-more-developers";
import { buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";

/** How many developers the anonymous, unfiltered "initial discovery" view shows (unchanged). */
const INITIAL_DISCOVERY_COUNT = 10;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TITLE = "Developer Connects | Property Advisory for Mumbai, Dubai and the UAE";
const DESCRIPTION =
  "Buy property in Mumbai, Dubai and across India and the UAE with clarity. Compare leading developers, understand every project and price, and get one-to-one expert guidance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Developer Connects", images: SHARE_IMAGES,
    type: "website",
  },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

/**
 * WebSite JSON-LD — lives here, not in the root layout, because it
 * describes the SITE'S search entry point, which is only meaningful
 * attached to the page that entry point actually is (the homepage's
 * search box). See layout.tsx's own comment for why Organization markup
 * (a different, site-wide concern) stays there instead. Deliberately no
 * SearchAction: that sitelinks-search-box feature has been retired.
 */
const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Developer Connects",
  // The same brand written as one word, as it appears in the domain —
  // helps search engines associate the site name with developerconnects.com.
  alternateName: "DeveloperConnects",
  url: "https://developerconnects.com/",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const resolvedSearchParams = await searchParams;
  const query = firstValue(resolvedSearchParams.q);
  const country = firstValue(resolvedSearchParams.country);
  const state = firstValue(resolvedSearchParams.state);
  const city = firstValue(resolvedSearchParams.city);
  const hasActiveFilter = Boolean(query || country || state || city);

  // Anonymous, no-filter "initial discovery" only ever narrows THIS
  // default view to a seeded sample — search, filters, and signed-in
  // visitors can page through the full published directory ("Load more").
  // Does not touch `stats`, which always reflects the real, complete
  // dataset regardless of what's shown below it.
  const { userId } = await auth();
  const isInitialDiscovery = !userId && !hasActiveFilter;
  const sessionId = await readSessionId();

  const repos = createPostgresRepositories();
  const { directory: visibleDirectory, totalMatching, geographyOptions, stats } = await getPublicHomepageData(
    repos,
    { query, country, state, city },
    isInitialDiscovery
      ? { initialDiscoverySeed: sessionId ?? randomUUID(), pageSize: INITIAL_DISCOVERY_COUNT }
      : { pageSize: DIRECTORY_PAGE_SIZE },
  );
  const isLimitedView = isInitialDiscovery && visibleDirectory.length < totalMatching;
  const hasMorePages = !isInitialDiscovery && visibleDirectory.length < totalMatching;

  // "Continue your research" (Part 8/9) — only on the plain, unfiltered
  // landing view; a visitor actively searching/filtering is already mid-
  // research, not returning to resume it. Real data only — no entry for
  // a visitor with no view history yet (see ContinueResearch).
  const recentlyViewed = hasActiveFilter
    ? []
    : await getRecentlyViewedDevelopers(repos, { userId: userId ?? undefined, sessionId: sessionId ?? undefined });

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <SiteHeader />

      <main className="flex-1">
        {/* HERO: always dark (cinematic footage under a scrim), so its text is fixed white in light and dark themes. */}
        <section className="relative isolate overflow-hidden text-white">
          <HeroVideo />
          <Container className="relative py-20 sm:py-32 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/90 sm:text-sm">
                Mumbai &middot; Dubai &middot; India &middot; UAE
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Find the right address.
                <span className="block text-sky-200">Buy it with clarity.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">
                Developer Connects is a property advisory platform for buyers in India and the UAE. Compare
                leading developers, understand the project and the price, and get one-to-one expert guidance,
                at your pace, from first search to keys in hand.
              </p>

              <div className="mx-auto mt-9 max-w-xl rounded-2xl bg-background p-2 text-left text-foreground shadow-2xl ring-1 ring-white/20">
                <SearchBox />
              </div>

              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/developers"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-7 text-sm font-semibold text-slate-900 transition-colors hover:bg-sky-100 sm:w-auto"
                >
                  Explore developers
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/40 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  Speak to an advisor
                </Link>
              </div>
            </div>
          </Container>
        </section>

        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-2xl">
            <div className="grid grid-cols-2 gap-4 text-center sm:gap-8">
              <StatCounter value={stats.verifiedDevelopers} label="Developers to explore" suffix="+" />
              {/* Deliberately no "+" — a count of covered countries isn't an
                  always-growing tally the way the developer count is;
                  see OPERATING_COUNTRIES's own doc comment. */}
              <CountriesCoveredCard value={stats.countriesCovered} />
            </div>
          </div>

          {!hasActiveFilter && (
            <section className="mx-auto mt-16 max-w-5xl sm:mt-24">
              <div className="max-w-2xl">
                <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Built around how people actually buy
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Today&apos;s buyers want the all-in price, the real timeline, the neighbourhood and the people behind
                  the project, without the pressure. That is what we put first.
                </p>
              </div>
              <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  {
                    kicker: "Mumbai",
                    title: "Space, connectivity and certainty",
                    body: "Compare Mumbai, Thane and Navi Mumbai on commute, carpet area, the all-in price and the possession timeline, so you choose the neighbourhood, not just the flat.",
                    slug: "mumbai",
                  },
                  {
                    kicker: "Dubai",
                    title: "Waterfront living, investor-grade clarity",
                    body: "Weigh off-plan and ready homes across Marina, Downtown, Creek Harbour and Business Bay. Understand payment plans, handover dates, service charges and residency options before you commit.",
                    slug: "dubai",
                  },
                  {
                    kicker: "From anywhere",
                    title: "Buying from overseas, made simple",
                    body: "For NRIs and global investors: shortlist, ask your questions and move forward over WhatsApp or a call, with one advisor who stays with you from first message to handover.",
                    slug: "india",
                  },
                ].map((card) => {
                  const market = buyDirectMarkets().find((m) => m.slug === card.slug);
                  return (
                    <li key={card.kicker} className="flex flex-col rounded-2xl border border-border bg-muted/40 p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-hover">{card.kicker}</p>
                      <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">{card.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{card.body}</p>
                      {market && (
                        <Link href={buyDirectPath(market)} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                          Read the {market.name} guide →
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <ContinueResearch developers={recentlyViewed} />

          <div className="mx-auto mt-12 max-w-5xl sm:mt-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Developers to explore
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Leading developers across India and the UAE. Open a profile, then talk to an advisor when you are ready.
                </p>
              </div>
              <GeoFilters options={geographyOptions} selected={{ country, state, city }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Looking for developers in a specific location? Use the filters above for quick
              navigation, or{" "}
              <Link href="/developers" className="text-accent-hover hover:underline">
                browse every developer
              </Link>
              .
            </p>

            {visibleDirectory.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
                <p className="font-medium text-foreground">
                  {hasActiveFilter ? "No developers match these filters." : "No developers yet."}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {hasActiveFilter
                    ? "Try a different country, state, or city."
                    : "Covering developers across India and the UAE, including Mumbai and Dubai."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
                  {visibleDirectory.map((developer) => (
                    <DeveloperCard key={developer.id} developer={developer} />
                  ))}
                </div>
                {isLimitedView && (
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Showing {visibleDirectory.length} of {totalMatching} developers.{" "}
                    Search, use filters, or sign in to see the full directory.
                  </p>
                )}
                {hasMorePages && (
                  <LoadMoreDevelopers
                    // Remount (resetting anything already appended) whenever the filters change.
                    key={`${query ?? ""}|${country ?? ""}|${state ?? ""}|${city ?? ""}`}
                    filter={{ query, country, state, city }}
                    renderedIds={visibleDirectory.map((developer) => developer.id)}
                    total={totalMatching}
                  />
                )}
              </>
            )}
          </div>

          {!hasActiveFilter && (
            <section className="mx-auto mt-16 max-w-5xl rounded-lg border border-border p-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Research a developer before you buy
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Step-by-step guides to reaching the right developer, checking the project with the regulator,
                and knowing what to ask for before you pay.{" "}
                <Link href={buyDirectPath()} className="text-accent-hover hover:underline">
                  Read the full guide
                </Link>
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {buyDirectMarkets()
                  .filter((market) => market.location.city)
                  .map((market) => (
                    <li key={market.slug}>
                      <Link href={buyDirectPath(market)} className="inline-flex min-h-11 items-center text-sm text-accent-hover hover:underline">
                        Research developers in {market.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </Container>
        {!hasActiveFilter && <BuyerJourney />}
      </main>

      <SiteFooter />
      {!userId && <LoginConversionPrompt />}
    </div>
  );
}
