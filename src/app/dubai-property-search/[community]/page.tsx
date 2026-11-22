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
import { COMMUNITIES, communityLabel, getCommunity, isDescribed } from "@/features/dubai-search/lib/communities";
import { REVIEWED_LINE } from "@/features/dubai-search/lib/content";
import { pagePath } from "@/features/dubai-search/lib/intents";
import { PortalSearch } from "@/features/dubai-search/components/portal-search";
import { CommunityGrid, CompareCta, Faq, IntentLinks, SECTION_PATH } from "@/features/dubai-search/components/section-parts";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMMUNITIES.map((c) => ({ community: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/dubai-property-search/[community]">): Promise<Metadata> {
  const { community: id } = await params;
  const c = getCommunity(id);
  if (!c) return {};
  const place = communityLabel(c);
  const title = `Property in ${place}, Dubai: Buy or Rent, Compared`;
  const description = `Search ${place} property once and open the same search on Bayut, Property Finder and dubizzle. Apartments${c.villas ? ", villas" : ""}${c.townhouses ? " and townhouses" : ""} to buy or rent, with a checklist before you contact an agent.`;
  const path = pagePath(c.id);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: isDescribed(c) ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: path, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
    twitter: { card: "summary_large_image", images: SHARE_IMAGES, title, description },
  };
}

export default async function CommunityPage({ params }: PageProps<"/dubai-property-search/[community]">) {
  if (!dubaiSearchEnabled()) notFound();
  const { community: id } = await params;
  const c = getCommunity(id);
  if (!c) notFound();
  const place = communityLabel(c);
  const faq = [
    {
      question: `What kinds of property can I search for in ${c.name}?`,
      answer: `You can open searches for apartments${c.villas ? ", villas" : ""}${c.townhouses ? " and townhouses" : ""} to buy or rent in ${c.name}. For apartments you can narrow by studio, one, two or three bedrooms.`,
    },
    {
      question: `How do I compare homes in ${c.name} across websites?`,
      answer: `Choose buy or rent and the type of home above, then open the same search on Bayut, Property Finder and dubizzle. Compare the asking price, the area in square feet, the floor and the date each advertisement was updated, and check the advertising permit number before you call.`,
    },
    {
      question: `Does Developer Connects list properties in ${c.name}?`,
      answer: "No. This page helps you search and compare. The buttons open each website's own results, and the listings belong to those websites. Developer Connects is independent and earns nothing from your clicks.",
    },
  ];
  const schema = [
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Dubai Property Search", path: SECTION_PATH }, { name: place, path: pagePath(c.id) }]),
    faqSchema(faq),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Dubai Property Search", href: SECTION_PATH }, { name: place }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Dubai Property Search</p>
            <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Property in {place}, Dubai</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{c.about ?? `Open the same ${c.name} search on the property websites and compare what each shows.`}</p>

            <div className="mt-8">
              <PortalSearch initialCommunity={c.id} />
            </div>

            <IntentLinks community={c} />
            <CompareCta />
            <Faq items={faq} />
            <CommunityGrid heading="Search other areas" exclude={c.id} />
            <AdviceCta heading={`Thinking of buying in ${c.name}?`} />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">
              {REVIEWED_LINE} {GENERAL_INFO_NOTE}
            </p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
