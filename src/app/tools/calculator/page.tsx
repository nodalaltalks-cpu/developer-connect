import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { BasicCalculator } from "@/components/seo/basic-calculator";
import { SHARE_IMAGES } from "@/lib/share-image";
import { BASIC_CALCULATOR_PATH, EMI_TOOL_PATH } from "@/lib/seo/tools";
import { breadcrumbSchema, SITE_URL } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Free Online Calculator for Property Sums | Developer Connects";
const DESCRIPTION = "A simple calculator for the everyday sums of a property search: prices, areas, per-square-foot rates, instalments and percentages. Free and instant.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: BASIC_CALCULATOR_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: BASIC_CALCULATOR_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function BasicCalculatorPage() {
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Calculator", path: BASIC_CALCULATOR_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${SITE_URL}${BASIC_CALCULATOR_PATH}#app`,
      name: "Calculator",
      url: `${SITE_URL}${BASIC_CALCULATOR_PATH}`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      provider: { "@id": `${SITE_URL}/#organization` },
      description: DESCRIPTION,
    },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Calculator" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Free tool</p>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Calculator</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              For the everyday sums of a property search: a price against an area, an instalment, a percentage. For a home loan, use the{" "}
              <Link href={EMI_TOOL_PATH} className="font-semibold text-accent-hover underline underline-offset-4">
                EMI calculator
              </Link>
              .
            </p>

            <BasicCalculator />

            <AdviceCta heading="Done with the sums? Get a short list that fits your budget." />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
