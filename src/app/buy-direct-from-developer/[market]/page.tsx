import { cache } from "react";
import { AdvisorPageContext } from "@/components/advisor/advisor";
import { FOUNDER } from "@/lib/founder";
import { RESEARCH_REVIEWED } from "@/lib/trust";
import { SHARE_IMAGES } from "@/lib/share-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BuyDirectFaq,
  BuyDirectSteps,
  breadcrumbStructuredData,
  faqStructuredData,
} from "@/components/buy-direct-guide-sections";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDirectoryPage } from "@/lib/developer-connect/search-service";
import {
  BUY_DIRECT_PATH,
  buyDirectFaq,
  buyDirectPath,
  getBuyDirectMarket,
} from "@/lib/developer-connect/buy-direct-guides";
import { locationPath } from "@/lib/developer-connect/location-pages";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

/** How many of the market's verified developers the guide links to directly; the rest are one click away in the directory. */
const LISTED_DEVELOPERS = 30;

// Always reflects the live directory, like the rest of the public site.
export const dynamic = "force-dynamic";

const loadMarketDevelopers = cache(async (slug: string) => {
  const market = getBuyDirectMarket(slug);
  if (!market) return null;
  const { country, city, cityAliases } = market.location;
  const { developers, total } = await getPublicDirectoryPage(
    createPostgresRepositories(),
    { country, city, cityAliases },
    0,
    LISTED_DEVELOPERS,
  );
  return { market, developers, total };
});

export async function generateMetadata({ params }: PageProps<"/buy-direct-from-developer/[market]">): Promise<Metadata> {
  const { market: slug } = await params;
  const data = await loadMarketDevelopers(slug);
  if (!data) return { title: "Guide not found | Developer Connects" };

  const { market, total } = data;
  const path = buyDirectPath(market);
  const title = `How to Research Developers in ${market.titleName} | Developer Connects`;
  const description = `Explore ${total} real estate developers in ${market.name}: check the project with ${market.regulator.name.split(" (")[0]}, ask for terms in writing, and request a connection through Developer Connects.`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "Developer Connects", images: SHARE_IMAGES, type: "article" },
    twitter: { card: "summary_large_image", images: SHARE_IMAGES, title, description },
    // A market with no developers yet is not a real guide page.
    ...(total === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BuyDirectMarketPage({ params }: PageProps<"/buy-direct-from-developer/[market]">) {
  const { market: slug } = await params;
  const data = await loadMarketDevelopers(slug);
  if (!data) notFound();

  const { market, developers, total } = data;
  const path = buyDirectPath(market);
  const faq = buyDirectFaq(market);
  const directoryHref = locationPath(market.location);
  const related = market.related
    .map((relatedSlug) => getBuyDirectMarket(relatedSlug))
    .filter((entry) => entry !== null);

  const structuredData = [
    breadcrumbStructuredData([
      { name: "Home", path: "/" },
      { name: "Developer research guides", path: BUY_DIRECT_PATH },
      { name: market.titleName, path },
    ]),
    faqStructuredData(faq),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `Researching developers in ${market.name}`,
      author: { "@type": "Person", name: FOUNDER.name, sameAs: [FOUNDER.linkedinUrl] },
      publisher: { "@id": "https://developerconnects.com/#organization" },
      dateModified: RESEARCH_REVIEWED.iso,
      mainEntityOfPage: `https://developerconnects.com${path}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Real estate developers in ${market.name}`,
      numberOfItems: developers.length,
      itemListElement: developers.map((developer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: developer.displayName,
        url: `https://developerconnects.com/developers/${developer.slug}`,
      })),
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <AdvisorPageContext article={`Researching developers in ${market.name}`} location={market.name} />
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <article className="mx-auto max-w-2xl">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-1">
                <li>
                  <Link href="/" className="inline-flex min-h-11 items-center hover:text-accent-hover hover:underline">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href={BUY_DIRECT_PATH} className="inline-flex min-h-11 items-center hover:text-accent-hover hover:underline">
                    Developer research guides
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-foreground">
                  {market.titleName}
                </li>
              </ol>
            </nav>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Researching developers in {market.name}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {total > 0
                ? `Research the developers in ${market.name} at your own pace. When you want a second opinion, talk to an advisor.`
                : `We are adding developers in ${market.name}. Check back soon.`}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              By {FOUNDER.name}, {FOUNDER.role.split(",")[0]} · Research reviewed {RESEARCH_REVIEWED.label}
            </p>

            {developers.length > 0 && (
              <>
                <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
                  Developers in {market.name}
                </h2>
                <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {developers.map((developer) => (
                    <li key={developer.id} className="min-w-0">
                      <Link
                        href={`/developers/${developer.slug}`}
                        className="block truncate py-2.5 text-foreground hover:text-accent-hover hover:underline"
                      >
                        {developer.displayName}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{developer.city}</span>
                    </li>
                  ))}
                </ul>
                {total > developers.length && (
                  <Link href={directoryHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">
                    See all {total} developers in {market.name} →
                  </Link>
                )}
              </>
            )}

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              How to research a developer in {market.name}
            </h2>
            <BuyDirectSteps />

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              Check the project with the regulator
            </h2>
            <div className="mt-4 rounded-lg border border-border bg-muted p-5">
              <p className="font-medium text-foreground">{market.regulator.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{market.regulator.check}</p>
              {market.regulator.url && (
                <a
                  href={market.regulator.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline"
                >
                  Visit the regulator&apos;s official website ↗
                </a>
              )}
            </div>
            {market.tips.map((tip) => (
              <p key={tip} className="mt-3 text-sm text-muted-foreground">
                {tip}
              </p>
            ))}

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              Frequently asked questions
            </h2>
            <BuyDirectFaq items={faq} />

            {related.length > 0 && (
              <>
                <h2 className="mt-12 text-lg font-semibold text-foreground">Other developer research guides</h2>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {related.map((other) => (
                    <li key={other.slug}>
                      <Link href={buyDirectPath(other)} className="text-sm text-accent-hover hover:underline">
                        Researching developers in {other.name}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href={BUY_DIRECT_PATH} className="text-sm text-accent-hover hover:underline">
                      How to research a developer (full guide)
                    </Link>
                  </li>
                </ul>
              </>
            )}

            <p className="mt-8 text-xs text-muted-foreground">
              This guide is general information, not legal or financial advice. Developer Connects is a
              property advisory platform that offers optional guidance when you are ready.
            </p>
          </article>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
