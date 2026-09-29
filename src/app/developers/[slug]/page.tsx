import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { OfficialWebsiteVerifiedBadge } from "@/components/official-website-verified-badge";
import { VisitOfficialWebsiteButton } from "@/components/visit-official-website-button";
import { ExternalDomainLink } from "@/components/external-domain-link";
import { DeveloperPageViewTracker } from "@/components/developer-page-view-tracker";
import { ShareDeveloper } from "@/components/share-developer";
import { ReportInaccurateInfo } from "@/components/report-inaccurate-info";
import { SiteFooter } from "@/components/site-footer";
import { LoginConversionPrompt } from "@/components/login-conversion-prompt";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDeveloperBySlug, listRelatedVerifiedDevelopers } from "@/lib/developer-connect/search-service";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";
import {
  alsoKnownAs,
  buildDeveloperMetadataText,
  developerIntroText,
  serializeJsonLd,
} from "@/lib/developer-connect/developer-page-content";

// React cache(): generateMetadata and the page both need this developer in
// the same request, so the second call reuses the first's result instead of
// querying again. Scoped to one render — nothing persists between requests.
const loadDeveloper = cache(async (slug: string) => {
  const repos = createPostgresRepositories();
  return getPublicDeveloperBySlug(repos, slug);
});

/**
 * Organization + BreadcrumbList JSON-LD for a VERIFIED developer's page —
 * describing the third-party developer entity itself, distinct from
 * Developer Connects' own Organization markup in the root layout. Only
 * ever built for a verified developer: every property here corresponds
 * to text already visible on the page, and `url` is deliberately the
 * developer's own verified official website, not this page's URL — the
 * exact developer -> official-website relationship this product exists
 * to establish. No logo, sameAs, description, or rating: none of that is
 * real, reviewed data this page actually has.
 */
function buildDeveloperStructuredData(developer: PublicDeveloperProfile) {
  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: developer.displayName,
    url: developer.officialWebsite!.url,
    address: {
      "@type": "PostalAddress",
      addressLocality: developer.city,
      addressRegion: developer.state,
      addressCountry: developer.country,
    },
  };
  if (developer.legalName && developer.legalName !== developer.displayName) {
    organization.legalName = developer.legalName;
  }

  // Breadcrumb items only ever point at pages that genuinely exist on
  // this site (Home, the /developers index, this page) — never a
  // fabricated country/state/city page the product hasn't built, per the
  // audit's explicit rule against fake geographic relationships.
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://developerconnects.com/" },
      { "@type": "ListItem", position: 2, name: "Developers", item: "https://developerconnects.com/developers" },
      {
        "@type": "ListItem",
        position: 3,
        name: developer.displayName,
        item: `https://developerconnects.com/developers/${developer.slug}`,
      },
    ],
  };

  return [organization, breadcrumb];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export async function generateMetadata({
  params,
}: PageProps<"/developers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const developer = await loadDeveloper(slug);

  if (!developer) {
    return { title: "Developer not found | Developer Connects" };
  }

  // A developer with no verified website yet is NOT an "official website"
  // page, so it is titled honestly and withheld from indexing below. The
  // page still exists for a visitor with the direct link (see
  // getPublicDeveloperBySlug's contract).
  const { title, description } = buildDeveloperMetadataText(developer);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/developers/${developer.slug}`,
      siteName: "Developer Connects",
      type: "website",
    },
    twitter: { card: "summary", title, description },
    alternates: { canonical: `/developers/${developer.slug}` },
    ...(developer.officialWebsite ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function DeveloperPage({
  params,
  searchParams,
}: PageProps<"/developers/[slug]">) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const referrerQuery =
    typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;

  const developer = await loadDeveloper(slug);
  if (!developer) {
    notFound();
  }

  const { userId } = await auth();
  const introText = developerIntroText(developer, formatDate);

  // Only fetched for a verified developer — an unverified page is
  // noindexed and low-traffic; there is no benefit to spending an extra
  // query surfacing "neighbors" around a page Google won't index anyway.
  // Same city first, then the same country, spread across the directory
  // by a per-developer starting point (see listRelatedVerifiedDevelopers).
  const relatedDevelopers = developer.officialWebsite
    ? await listRelatedVerifiedDevelopers(createPostgresRepositories(), developer)
    : [];
  // The heading only says "in {city}" when that is true of every link.
  const relatedAllInCity = relatedDevelopers.every(
    (other) => other.city.toLowerCase() === developer.city.toLowerCase(),
  );

  return (
    <div className="flex flex-1 flex-col">
      <DeveloperPageViewTracker developerId={developer.id} referrerQuery={referrerQuery} />
      {developer.officialWebsite && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildDeveloperStructuredData(developer)) }}
        />
      )}

      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-xl">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <ol className="flex items-center gap-1">
                <li>
                  <Link href="/" className="hover:text-accent-hover hover:underline">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/developers" className="hover:text-accent-hover hover:underline">
                    Developers
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="truncate text-foreground">
                  {developer.displayName}
                </li>
              </ol>
            </nav>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {developer.displayName}
            </h1>

            {introText && <p className="mt-2 text-foreground">{introText}</p>}

            {developer.headquartersLocation && (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Head office
                </p>
                <p className="mt-0.5 text-sm text-foreground">{developer.headquartersLocation}</p>
              </div>
            )}

            {developer.officialWebsite ? (
              <div className="mt-6 rounded-lg border border-border bg-muted p-6">
                <OfficialWebsiteVerifiedBadge full />
                <p className="mt-4 text-sm text-muted-foreground">Official website</p>
                <ExternalDomainLink
                  url={developer.officialWebsite.url}
                  domain={developer.officialWebsite.canonicalDomain}
                  className="mt-1 font-mono text-lg"
                />
                <div className="mt-5">
                  <VisitOfficialWebsiteButton
                    developerId={developer.id}
                    url={developer.officialWebsite.url}
                    domain={developer.officialWebsite.canonicalDomain}
                  />
                </div>
                {developer.officialWebsite.verifiedAt && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Last verified {formatDate(developer.officialWebsite.verifiedAt)}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-8 rounded-lg border border-border bg-muted p-6">
                <p className="font-medium text-foreground">Official website not yet verified.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Developer Connects hasn&apos;t confirmed {developer.displayName}&apos;s official
                  website yet. Check back soon.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ShareDeveloper developerId={developer.id} developerName={developer.displayName} />
              <ReportInaccurateInfo developerId={developer.id} developerName={developer.displayName} />
            </div>

            {alsoKnownAs(developer) && (
              <p className="mt-6 text-xs text-muted-foreground">Also known as {alsoKnownAs(developer)}</p>
            )}
          </div>

          {relatedDevelopers.length > 0 && (
            <div className="mx-auto mt-16 max-w-2xl border-t border-border pt-10">
              <h2 className="text-lg font-semibold text-foreground">
                {relatedAllInCity ? (
                  <>Other verified developers in {developer.city}</>
                ) : (
                  <>Other verified developers in {developer.country}</>
                )}
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {relatedDevelopers.map((other) => (
                  <li key={other.id} className="min-w-0">
                    <Link
                      href={`/developers/${other.slug}`}
                      className="block truncate text-foreground hover:text-accent-hover hover:underline"
                    >
                      {other.displayName}
                    </Link>
                    {other.officialWebsite && (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {other.officialWebsite.canonicalDomain}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </main>

      <SiteFooter />
      {!userId && <LoginConversionPrompt />}
    </div>
  );
}
