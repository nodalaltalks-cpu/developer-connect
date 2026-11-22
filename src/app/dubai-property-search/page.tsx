import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";
import { dubaiSearchEnabled } from "@/features/dubai-search/flag";
import { PortalSearch } from "@/features/dubai-search/components/portal-search";
import { CommunityGrid, CompareCta, Faq, GuideLinks, SECTION_PATH } from "@/features/dubai-search/components/section-parts";
import { HUB_FAQ } from "@/features/dubai-search/lib/hub";

const TITLE = "Dubai Property Search: Compare Bayut, Property Finder and dubizzle";
const DESCRIPTION =
  "Search Dubai property once and open the same search on Bayut, Property Finder and dubizzle. Pick the area, buy or rent, type and bedrooms, then compare prices and check the advertising permit. Free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SECTION_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: SECTION_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function DubaiPropertySearchPage() {
  if (!dubaiSearchEnabled()) notFound();
  const schema = [breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Dubai Property Search", path: SECTION_PATH }]), faqSchema(HUB_FAQ)];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Dubai Property Search" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Dubai Property Search</p>
            <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">One search. Every Dubai property website.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Choose where you want to buy or rent and we set up the same search on Bayut, Property Finder and dubizzle for you. Compare the results side by side, then check the advertising permit before you call anyone. Free to use, with nothing to sign up for.
            </p>

            <div className="mt-8">
              <PortalSearch />
            </div>

            <section aria-labelledby="dps-how" className="mt-14">
              <h2 id="dps-how" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
                How it works
              </h2>
              <ol className="mt-5 grid gap-6 sm:grid-cols-3">
                <li>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-700">1. Search once</p>
                  <p className="mt-2 text-sm leading-7 text-foreground/80">Pick the area, buy or rent, the type of home and the number of bedrooms.</p>
                </li>
                <li>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-700">2. Open every website</p>
                  <p className="mt-2 text-sm leading-7 text-foreground/80">Each button opens that website&apos;s own live results for your search. Nothing is copied, so you always see their current listings.</p>
                </li>
                <li>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-700">3. Compare and check</p>
                  <p className="mt-2 text-sm leading-7 text-foreground/80">Add listings you like to our comparison tool to see if they are the same flat, and use the checklist before you contact an agent.</p>
                </li>
              </ol>
            </section>

            <CommunityGrid />
            <CompareCta />
            <GuideLinks />
            <Faq items={HUB_FAQ} />
            <AdviceCta heading="Want a second opinion on your Dubai shortlist?" />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
