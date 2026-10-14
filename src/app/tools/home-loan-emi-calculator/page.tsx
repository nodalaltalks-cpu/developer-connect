import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, FaqList, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { EmiCalculator } from "@/components/seo/emi-calculator";
import { SHARE_IMAGES } from "@/lib/share-image";
import { EMI_TOOL_FAQ, EMI_TOOL_PATH } from "@/lib/seo/tools";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Home Loan EMI Calculator for India and Dubai | Developer Connects";
const DESCRIPTION =
  "Work out your home loan EMI, total interest and how much you can borrow, in rupees for India or dirhams for Dubai. Free, instant, no sign-up.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: EMI_TOOL_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: EMI_TOOL_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function EmiCalculatorPage() {
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: "Home loan EMI calculator", path: EMI_TOOL_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${SITE_URL}${EMI_TOOL_PATH}#app`,
      name: "Home loan EMI calculator",
      url: `${SITE_URL}${EMI_TOOL_PATH}`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      provider: { "@id": `${SITE_URL}/#organization` },
      description: DESCRIPTION,
    },
    faqSchema(EMI_TOOL_FAQ),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "Home loan EMI calculator" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Free tool</p>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Home loan EMI calculator</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              See your monthly instalment, the total interest and what you repay over the loan, or turn it round and see how much you can borrow for the EMI you can afford. Rupees for India, dirhams for Dubai.
            </p>

            <EmiCalculator />
            <p className="mt-4 text-sm text-muted-foreground">
              Need an ordinary calculator for other sums?{" "}
              <Link href="/tools/calculator" className="font-semibold text-accent-hover underline underline-offset-4">
                Open the calculator
              </Link>
              .
            </p>

            <div className="mx-auto mt-16 max-w-2xl">
              <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">How the EMI is worked out</h2>
              <p className="mt-4 text-base leading-7 text-foreground/85">
                Home loans in India and the UAE are usually repaid on a reducing balance: each instalment pays the month&apos;s interest on what you still owe, and the rest reduces the loan. The standard formula is EMI = P × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> − 1), where P is the loan amount, r the monthly interest rate (the yearly rate divided by 12 and by 100) and n the number of monthly instalments.
              </p>
              <p className="mt-4 text-base leading-7 text-foreground/85">
                In the early years most of each instalment is interest; in the later years most of it repays the loan. That is why a part-prepayment early in the loan saves far more interest than the same amount paid near the end.
              </p>

              <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Before you take the number to a lender</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:text-brass-700">
                <li>Lenders cap the EMI at a share of your income and count your existing loans, so get an eligibility letter before you book.</li>
                <li>The loan covers part of the property value; the down payment, stamp duty, registration and other costs come from your own funds.</li>
                <li>Ask whether the rate is fixed or floating, what it is linked to, and the charges for prepayment or switching.</li>
                <li>For an under-construction home, interest during construction depends on how much has been disbursed, not the full loan.</li>
              </ul>
              <p className="mt-6 text-base leading-7 text-foreground/85">
                Read our guides on <Link href="/guides/home-loan-before-you-buy-property" className="font-semibold text-accent-hover underline underline-offset-4">getting a home loan before you buy</Link> and the{" "}
                <Link href="/guides/hidden-costs-of-buying-property-in-mumbai" className="font-semibold text-accent-hover underline underline-offset-4">hidden costs of buying property in Mumbai</Link>, or{" "}
                <Link href="/guides/buying-property-in-dubai-from-india" className="font-semibold text-accent-hover underline underline-offset-4">buying in Dubai from India</Link>.
              </p>

              <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Questions buyers ask</h2>
              <FaqList items={EMI_TOOL_FAQ} />

              <AdviceCta heading="Know your budget? Get a short list that fits it." />
              <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
