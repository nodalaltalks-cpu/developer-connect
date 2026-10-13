import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdvisorPageContext } from "@/components/advisor/advisor";
import { AdviceCta, Breadcrumb, FaqList, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { COMMISSION_POLICY } from "@/lib/leads/gate/gate-copy";
import { CONSULTANT_PAGES, CONSULTANT_PATH, consultantPath, getConsultantPage } from "@/lib/seo/consultant-pages";
import { getGuide, guidePath } from "@/lib/seo/guides";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import { resolveLocationPage, locationPath } from "@/lib/developer-connect/location-pages";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

export const dynamicParams = false;

export function generateStaticParams() {
  return CONSULTANT_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/property-consultant/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = getConsultantPage(slug);
  if (!page) return { title: "Page not found | Developer Connects" };
  const path = consultantPath(page);
  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: path },
    openGraph: { title: page.metaTitle, description: page.description, url: path, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
    twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: page.metaTitle, description: page.description },
  };
}

export default async function ConsultantCityPage({ params }: PageProps<"/property-consultant/[slug]">) {
  const { slug } = await params;
  const page = getConsultantPage(slug);
  if (!page) notFound();
  const path = consultantPath(page);
  const directory = resolveLocationPage(page.directory.country, page.directory.city);
  const guides = page.guides.map((g) => getGuide(g)).filter((g) => g !== undefined);
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Property consultant", path: CONSULTANT_PATH },
      { name: page.name, path },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${SITE_URL}${path}#service`,
      name: page.title,
      serviceType: "Property advisory",
      provider: { "@id": `${SITE_URL}/#organization` },
      areaServed: { "@type": "City", name: page.name },
      description: page.description,
      url: `${SITE_URL}${path}`,
    },
    faqSchema(page.faq),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <AdvisorPageContext location={page.name} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <article className="mx-auto max-w-2xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Property consultant", href: CONSULTANT_PATH }, { name: page.name }]} />
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.1] tracking-tight text-foreground sm:text-5xl">{page.title}</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{page.intro}</p>

            <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">How we help in {page.name}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:text-brass-700">
              {page.helpWith.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Areas we cover in {page.name}</h2>
            {page.areaGroups.map((group) => (
              <div key={group.heading} className="mt-5">
                <h3 className="text-sm font-semibold text-foreground">{group.heading}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.areas.map((area) => (
                    <li key={area} className="rounded-sm border border-field-border bg-white px-3 py-1.5 text-sm text-foreground">
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Check the project with the regulator</h2>
            <div className="mt-4 rounded-xl border border-border bg-white p-5">
              <p className="font-semibold text-foreground">{page.regulator.name}</p>
              <p className="mt-2 text-sm leading-6 text-foreground/80">{page.regulator.check}</p>
            </div>

            <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">What it costs you</h2>
            <p className="mt-4 text-base leading-7 text-foreground/85">{COMMISSION_POLICY}</p>

            {page.alsoServing && (
              <p className="mt-8">
                <Link href={`${CONSULTANT_PATH}/${page.alsoServing.slug}`} className="font-semibold text-accent-hover underline-offset-4 hover:underline">
                  {page.alsoServing.label} →
                </Link>
              </p>
            )}

            {directory && (
              <p className="mt-8">
                <Link href={locationPath(directory)} className="font-semibold text-accent-hover underline-offset-4 hover:underline">
                  Browse developers in {page.name} →
                </Link>
              </p>
            )}

            <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Questions buyers ask</h2>
            <FaqList items={page.faq} />

            <AdviceCta heading={`Looking in ${page.name}? Tell us what you need.`} />

            {guides.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-foreground">Guides for {page.name} buyers</h2>
                <ul className="mt-3 space-y-2">
                  {guides.map((g) => (
                    <li key={g.slug}>
                      <Link href={guidePath(g)} className="text-accent-hover underline-offset-4 hover:underline">
                        {g.title}
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
