import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDirectoryPage } from "@/lib/developer-connect/search-service";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";

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
  "Browse every real estate developer verified by Developer Connects, with a direct link to each one's verified official website.";

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/developers">): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const canonical = page > 1 ? `/developers?page=${page}` : "/developers";

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: { title: TITLE, description: DESCRIPTION, url: canonical, siteName: "Developer Connects", type: "website" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
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
  const offset = (page - 1) * PAGE_SIZE;

  const repos = createPostgresRepositories();
  const { developers, total } = await getPublicDirectoryPage(repos, {}, offset, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A page number beyond the real range is never a genuine listing —
  // treat it the same as any other nonexistent page rather than silently
  // rendering an empty shell a crawler could index as thin content.
  if (page > totalPages) {
    notFound();
  }

  const groups = groupByFirstLetter(developers);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex items-center gap-1">
              <li>
                <Link href="/" className="hover:text-accent-hover hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">
                Developers
              </li>
            </ol>
          </nav>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            All verified developers
          </h1>
          <p className="mt-2 text-muted-foreground">
            {total} real estate developer{total === 1 ? "" : "s"} with an official website
            verified by Developer Connects.
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
                        {developer.officialWebsite && (
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {developer.officialWebsite.canonicalDomain}
                          </span>
                        )}
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
                  href={page - 1 === 1 ? "/developers" : `/developers?page=${page - 1}`}
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
                  href={`/developers?page=${page + 1}`}
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
