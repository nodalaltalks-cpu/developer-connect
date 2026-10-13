import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { GLOSSARY, GLOSSARY_PATH, type GlossaryTerm } from "@/lib/seo/tools";
import { breadcrumbSchema, SITE_URL } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Property Glossary: Mumbai and Dubai Terms Explained | Developer Connects";
const DESCRIPTION =
  "Carpet area, MahaRERA, OC, stamp duty, Oqood, escrow, service charge and more: the property terms buyers meet in Mumbai and Dubai, each explained in plain words.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: GLOSSARY_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: GLOSSARY_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

const SECTIONS: { heading: string; markets: GlossaryTerm["market"][] }[] = [
  { heading: "Buying in India and Mumbai", markets: ["India"] },
  { heading: "Buying in Dubai", markets: ["Dubai"] },
  { heading: "Terms used in both", markets: ["Both"] },
];

export default function GlossaryPage() {
  const url = `${SITE_URL}${GLOSSARY_PATH}`;
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: "Property glossary", path: GLOSSARY_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      "@id": `${url}#terms`,
      name: "Property glossary for buyers in Mumbai and Dubai",
      url,
      publisher: { "@id": `${SITE_URL}/#organization` },
      hasDefinedTerm: GLOSSARY.map((t) => ({
        "@type": "DefinedTerm",
        "@id": `${url}#${t.id}`,
        name: t.term,
        description: t.definition,
        url: `${url}#${t.id}`,
        inDefinedTermSet: `${url}#terms`,
      })),
    },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "Property glossary" }]} />
            <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Property glossary</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              The words you will meet on brochures, cost sheets and agreements in Mumbai and Dubai, each explained in a sentence or two. Every term has its own link you can share.
            </p>
            <nav aria-label="Jump to a term" className="mt-8 flex flex-wrap gap-2">
              {GLOSSARY.map((t) => (
                <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-9 items-center rounded-sm border border-field-border bg-white px-3 text-sm text-foreground hover:border-gold">
                  {t.term}
                </a>
              ))}
            </nav>
            {SECTIONS.map((section) => (
              <section key={section.heading} className="mt-14">
                <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">{section.heading}</h2>
                <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-white">
                  {GLOSSARY.filter((t) => section.markets.includes(t.market)).map((t) => (
                    <div key={t.id} id={t.id} className="scroll-mt-24 p-5 sm:p-6">
                      <dt className="font-serif text-xl font-medium text-foreground">{t.term}</dt>
                      <dd className="mt-2 text-base leading-7 text-foreground/85">{t.definition}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <AdviceCta heading="A term on your agreement you are not sure about? Ask us." />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
