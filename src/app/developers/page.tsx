import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDirectoryPage } from "@/lib/developer-connect/search-service";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";
import {
  developersPath,
  locationBreadcrumbs,
  locationIntro,
  locationMetadataText,
  resolveLocationPage,
} from "@/lib/developer-connect/location-pages";
import { buyDirectMarketForLocation, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";
import { breadcrumbStructuredData } from "@/components/buy-direct-guide-sections";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

/**
 * How many developers one page of this index shows. Deliberately plain
 * server-rendered <a> links with real ?page=N URLs — never the
 * homepage's client-side "Load more" — so a crawler with no JavaScript
 * can walk every published developer via ordinary hyperlinks. This is the
 * page that closes the "1,190 developers are unreachable except through
 * the sitemap" gap identified in the SEO audit: without it, the only path
 * to most developer pages was the sitemap itself.
 */
const PAGE_SIZE = 100;

const TITLE = "All verified developers | Developer Connects";
const DESCRIPTION =
  "Browse every real estate developer verified by Developer Connects, and request a connection with the one you want.";

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * One directory page, shared by generateMetadata and the page itself so a
 * request queries once (cache() reuses the result within a render; the
 * arguments are primitives on purpose so calls with the same values match).
 * With no location the filter is empty — exactly the original behaviour.
 */
const loadDirectoryPage = cache(
  async (country: string | undefined, city: string | undefined, cityAliases: string, page: number) => {
    const repos = createPostgresRepositories();
    // Aliases arrive "|"-joined so every cache() argument stays a primitive.
    const aliases = cityAliases ? cityAliases.split("|") : undefined;
    return getPublicDirectoryPage(repos, { country, city, cityAliases: aliases }, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  },
);

export async function generateMetadata({
  searchParams,
}: PageProps<"/developers">): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  // Only the approved country/city values become a location page; anything
  // else (other cities, other parameters) is ignored, as it always was.
  const location = resolveLocationPage(resolvedSearchParams.country, resolvedSearchParams.city);

  if (!location) {
    const canonical = developersPath(null, page);
    return {
      title: TITLE,
      description: DESCRIPTION,
      alternates: { canonical },
      openGraph: { title: TITLE, description: DESCRIPTION, url: canonical, siteName: "Developer Connects", type: "website" },
      twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
    };
  }

  const text = locationMetadataText(location, page);
  const canonical = developersPath(location, page);
  // An approved location that has no results is not a real listing, so it is kept out of the index.
  const { total } = await loadDirectoryPage(location.country, location.city, location.cityAliases?.join("|") ?? "", page);

  return {
    title: text.title,
    description: text.description,
    alternates: { canonical },
    openGraph: { title: text.title, description: text.description, url: canonical, siteName: "Developer Connects", type: "website" },
    twitter: { card: "summary", title: text.title, description: text.description },
    ...(total === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Groups an already alphabetically-sorted list into sections by the first letter of displayName. */
function groupByFirstLetter(
  developers: PublicDeveloperProfile[],
): { letter: string; developers: PublicDeveloperProfile[] }[] {
  const groups: { letter: string; developers: PublicDeveloperProfile[] }[] = [];
  for (const developer of developers) {
    const letter = developer.displayName[0]?.toUpperCase() ?? "#";
    const current = groups.at(-1);
    if (current?.letter === letter) {
      current.developers.push(developer);
    } else {
      groups.push({ letter, developers: [developer] });
    }
  }
  return groups;
}

export default async function DevelopersIndexPage({
  searchParams,
}: PageProps<"/developers">) {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const location = resolveLocationPage(resolvedSearchParams.country, resolvedSearchParams.city);

  const { developers, total } = await loadDirectoryPage(
    location?.country,
    location?.city,
    location?.cityAliases?.join("|") ?? "",
    page,
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A page number beyond the real range is never a genuine listing —
  // treat it the same as any other nonexistent page rather than silently
  // rendering an empty shell a crawler could index as thin content.
  if (page > totalPages) {
    notFound();
  }

  const groups = groupByFirstLetter(developers);
  const breadcrumbs = location
    ? locationBreadcrumbs(location)
    : [{ label: "Home", href: "/" }, { label: "Developers" }];
  const buyDirectGuide = location ? buyDirectMarketForLocation(location.country, location.city ?? "") : null;
  // BreadcrumbList mirrors the visible breadcrumb; the current page (no href) uses its own canonical URL.
  const breadcrumbJsonLd = breadcrumbStructuredData(
    breadcrumbs.map((item) => ({ name: item.label, path: item.href ?? developersPath(location, 1) })),
  );

  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {breadcrumbs.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {item.href ? (
                    <Link href={item.href} className="hover:text-accent-hover hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {location ? locationMetadataText(location).h1 : "All verified developers"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {location
              ? locationIntro(location, total)
              : `${total} real estate developer${total === 1 ? "" : "s"} to research, each with an official website verified by Developer Connects.`}
          </p>
          <p className="mt-2 text-sm">
            <Link href={buyDirectPath(buyDirectGuide)} className="text-accent-hover hover:underline">
              {buyDirectGuide
                ? `How to research developers in ${buyDirectGuide.name} →`
                : "How to research a developer before you buy →"}
            </Link>
          </p>

          {groups.length === 0 ? (
            <p className="mt-8 text-muted-foreground">No verified developers yet.</p>
          ) : (
            <div className="mt-8 space-y-8">
              {groups.map((group) => (
                <div key={group.letter}>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.letter}
                  </h2>
                  <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.developers.map((developer) => (
                      <li key={developer.id} className="min-w-0">
                        <Link
                          href={`/developers/${developer.slug}`}
                          className="block truncate text-foreground hover:text-accent-hover hover:underline"
                        >
                          {developer.displayName}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">{developer.city}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-10 flex items-center justify-between border-t border-border pt-6"
            >
              {page > 1 ? (
                <Link
                  href={developersPath(location, page - 1)}
                  className="text-sm font-medium text-accent-hover hover:underline"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={developersPath(location, page + 1)}
                  className="text-sm font-medium text-accent-hover hover:underline"
                >
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
