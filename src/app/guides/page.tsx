import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { GUIDES_PATH, guidePath, guidesByTopic } from "@/lib/seo/guides";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Property Buying Guides for Mumbai, Dubai and India | Developer Connects";
const DESCRIPTION =
  "Plain-English guides for property buyers: how to buy a flat in Mumbai, Dubai off-plan and costs, MahaRERA checks, NRI rules, home loans and choosing an advisor.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: GUIDES_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: GUIDES_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function GuidesPage() {
  const groups = guidesByTopic();
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: GUIDES_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Property buying guides",
      url: `https://developerconnects.com${GUIDES_PATH}`,
      hasPart: groups.flatMap((g) => g.guides).map((guide) => ({ "@type": "Article", headline: guide.title, url: `https://developerconnects.com${guidePath(guide)}` })),
    },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Guides" }]} />
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">Property buying guides</h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Know before you buy. Plain-English guides for buyers in Mumbai, Dubai and across India, written by Ambish Singh from years of closing property deals.
            </p>
            {groups.map((group) => (
              <section key={group.topic} className="mt-12">
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">{group.topic}</h2>
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {group.guides.map((guide) => (
                    <li key={guide.slug}>
                      <Link href={guidePath(guide)} className="block py-5 hover:bg-muted/60">
                        <span className="font-serif text-xl font-medium text-foreground">{guide.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{guide.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <AdviceCta />
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
