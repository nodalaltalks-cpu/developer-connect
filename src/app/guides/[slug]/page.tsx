import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdvisorPageContext } from "@/components/advisor/advisor";
import { AdviceCta, Blocks, Breadcrumb, Byline, FaqList, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { GUIDES, GUIDES_PATH, getGuide, guidePath, relatedGuides } from "@/lib/seo/guides";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found | Developer Connects" };
  const path = guidePath(guide);
  const title = `${guide.metaTitle} | Developer Connects`;
  return {
    title,
    description: guide.description,
    alternates: { canonical: path },
    openGraph: { title, description: guide.description, url: path, siteName: "Developer Connects", images: SHARE_IMAGES, type: "article", modifiedTime: guide.updated },
    twitter: { card: "summary_large_image", images: SHARE_IMAGES, title, description: guide.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const path = guidePath(guide);
  const related = relatedGuides(guide);
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: GUIDES_PATH },
      { name: guide.title, path },
    ]),
    articleSchema(guide),
    faqSchema(guide.faq),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <AdvisorPageContext article={guide.title} location={guide.market === "dubai" ? "Dubai" : guide.market === "mumbai" ? "Mumbai" : undefined} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <article className="mx-auto max-w-2xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Guides", href: GUIDES_PATH }, { name: guide.topic }]} />
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.1] tracking-tight text-foreground sm:text-5xl">{guide.title}</h1>
            <Byline updated={guide.updated} />
            <p className="mt-6 rounded-xl border border-border bg-white p-5 text-base leading-7 text-foreground">
              <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-brass-700">In short</span>
              <span className="mt-1 block">{guide.summary}</span>
            </p>
            <Blocks blocks={guide.blocks} />

            <h2 className="mt-14 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Frequently asked questions</h2>
            <FaqList items={guide.faq} />

            <AdviceCta />

            {related.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-foreground">Keep reading</h2>
                <ul className="mt-3 space-y-2">
                  {related.slice(0, 3).map((r) => (
                    <li key={r.slug}>
                      <Link href={guidePath(r)} className="text-accent-hover underline-offset-4 hover:underline">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </article>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
