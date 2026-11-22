import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";
import { dubaiSearchEnabled } from "@/features/dubai-search/flag";
import { communityLabel } from "@/features/dubai-search/lib/communities";
import { checklistFor, faqFor, introFor, REVIEWED_LINE } from "@/features/dubai-search/lib/content";
import { allPages, intentLabel, isIndexable, pagePath, pageTitle, resolve } from "@/features/dubai-search/lib/intents";
import { portalLinks, PORTAL_NOTICE } from "@/features/dubai-search/lib/portals";
import { PortalButton } from "@/features/dubai-search/components/portal-button";
import { PortalSearch } from "@/features/dubai-search/components/portal-search";
import { CommunityGrid, CompareCta, Faq, GuideLinks, IntentLinks, SECTION_PATH } from "@/features/dubai-search/components/section-parts";

export const dynamicParams = false;

export function generateStaticParams() {
  return allPages();
}

export async function generateMetadata({ params }: PageProps<"/dubai-property-search/[community]/[intent]">): Promise<Metadata> {
  const { community, intent } = await params;
  const r = resolve(community, intent);
  if (!r) return {};
  const title = `${pageTitle(r.community, r.intent)} | Compare Portals`;
  const description = `${intentLabel(r.intent)} in ${communityLabel(r.community)}, Dubai. Open the same search on Bayut, Property Finder and dubizzle, compare prices and area, and use the checklist before you contact an agent.`;
  const path = pagePath(r.community.id, r.intent.slug);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: isIndexable(r.community, r.intent) ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: path, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
    twitter: { card: "summary_large_image", images: SHARE_IMAGES, title, description },
  };
}

export default async function IntentPage({ params }: PageProps<"/dubai-property-search/[community]/[intent]">) {
  if (!dubaiSearchEnabled()) notFound();
  const { community: cid, intent: slug } = await params;
  const r = resolve(cid, slug);
  if (!r) notFound();
  const { community: c, intent: i } = r;
  const place = communityLabel(c);
  const heading = `${intentLabel(i)} in ${place}, Dubai`;
  const links = portalLinks({ community: c, purpose: i.purpose, kind: i.kind, bedrooms: i.bedrooms });
  const faq = faqFor(c, i);
  const path = pagePath(c.id, i.slug);
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Dubai Property Search", path: SECTION_PATH },
      { name: place, path: pagePath(c.id) },
      { name: intentLabel(i), path },
    ]),
    faqSchema(faq),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Dubai Property Search", href: SECTION_PATH }, { name: place, href: pagePath(c.id) }, { name: intentLabel(i) }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Dubai Property Search</p>
            <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">{heading}</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">{introFor(c, i)}</p>

            <section aria-labelledby="dps-open" className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
              <h2 id="dps-open" className="text-base font-semibold text-foreground">
                See this search on every website
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {links.map((l) => (
                  <PortalButton key={l.id} link={l} page={path} primary={l.id !== "dubizzle"} />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">{PORTAL_NOTICE}</p>
            </section>

            <section aria-labelledby="dps-check" className="mt-12">
              <h2 id="dps-check" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
                Before you contact an agent
              </h2>
              <ul className="mt-5 space-y-3">
                {checklistFor(i).map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-7 text-foreground/85">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brass-700" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-foreground/80">
                New to buying from abroad? Read <Link href="/guides/buying-property-in-dubai-from-india" className="font-semibold text-accent-hover underline underline-offset-4">our guide to buying in Dubai from India</Link>.
              </p>
            </section>

            <CompareCta />

            <section aria-label="Change your search" className="mt-12">
              <h2 className="font-serif text-2xl font-medium text-foreground sm:text-3xl">Change your search</h2>
              <div className="mt-5">
                <PortalSearch initialCommunity={c.id} initialPurpose={i.purpose} />
              </div>
            </section>

            <IntentLinks community={c} current={i.slug} />
            <Faq items={faq} />
            <GuideLinks />
            <CommunityGrid heading="Search other areas" exclude={c.id} />
            <AdviceCta heading={`Want help choosing in ${c.name}?`} />
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
