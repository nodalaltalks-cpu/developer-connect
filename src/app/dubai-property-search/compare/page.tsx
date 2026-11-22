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
import { DubaiSearchApp } from "@/features/dubai-search/components/dubai-search-app";
import { Faq, SECTION_PATH, COMPARE_PATH } from "@/features/dubai-search/components/section-parts";
import { COMPARE_FAQ } from "@/features/dubai-search/lib/hub";

const TITLE = "Compare Dubai Property Listings: Is It the Same Flat?";
const DESCRIPTION =
  "Found a Dubai flat on more than one website? Add the listings and see whether they look like the same property, the price gap between them, and what to confirm before you call. Free, and your list stays in your browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: COMPARE_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: COMPARE_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function ComparePage() {
  if (!dubaiSearchEnabled()) notFound();
  const schema = [
    breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Dubai Property Search", path: SECTION_PATH }, { name: "Compare listings", path: COMPARE_PATH }]),
    faqSchema(COMPARE_FAQ),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Dubai Property Search", href: SECTION_PATH }, { name: "Compare listings" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Dubai Property Search</p>
            <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Is it the same flat? Compare listings.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Agents often advertise the same flat on several websites, sometimes at different prices. Add the listings you found and we show which ones look like the same property and how far apart the prices are. Your list stays in your browser.
            </p>
            <div className="mt-8">
              <DubaiSearchApp />
            </div>
            <Faq items={COMPARE_FAQ} />
            <AdviceCta heading="Want a second opinion on your shortlist?" />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
