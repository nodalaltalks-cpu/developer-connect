import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, FaqList, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { DelayInterestCalculator } from "@/components/seo/delay-interest-calculator";
import { SHARE_IMAGES } from "@/lib/share-image";
import { DELAY_TOOL_FAQ, DELAY_TOOL_PATH } from "@/lib/seo/tools";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Possession Delay Interest Calculator for Flat Buyers in India | Developer Connects";
const DESCRIPTION =
  "Flat handed over late? Work out the interest you may be owed for the delay under RERA: enter what you paid, your agreement date and your state's rate. Free, no sign-up.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: DELAY_TOOL_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: DELAY_TOOL_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function DelayInterestCalculatorPage() {
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: "Possession delay interest calculator", path: DELAY_TOOL_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${SITE_URL}${DELAY_TOOL_PATH}#app`,
      name: "Possession delay interest calculator",
      url: `${SITE_URL}${DELAY_TOOL_PATH}`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      provider: { "@id": `${SITE_URL}/#organization` },
      description: DESCRIPTION,
    },
    faqSchema(DELAY_TOOL_FAQ),
  ];
  const link = "font-semibold text-accent-hover underline underline-offset-4";
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "Possession delay interest calculator" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Free tool</p>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Possession delay interest calculator</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Is your flat late? Enter what you have paid, the possession date in your agreement and the rate your state sets, and see the interest you may be owed for the delay, and what each further month adds.
            </p>

            <DelayInterestCalculator />

            <div className="mx-auto mt-16 max-w-2xl">
              <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">How the interest is worked out</h2>
              <p className="mt-4 text-base leading-7 text-foreground/85">
                India&apos;s RERA Act lets a buyer who stays in a delayed project claim interest on the amount paid for the period of delay, until possession is handed over. The calculator uses simple interest: the amount you paid, times the yearly rate, for each day between the possession date in your agreement and the handover date.
              </p>
              <p className="mt-4 text-base leading-7 text-foreground/85">
                The rate is not the same everywhere. Each state&apos;s RERA rules set it, and it can change, which is why this page asks you to type it. Find the current rate on your state RERA authority&apos;s website, and check how your agreement words the delay clause.
              </p>

              <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">If your flat is late: a sensible order</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:font-semibold marker:text-brass-700">
                <li>Read the possession and delay clauses in your agreement, and any letter from the developer about a new date.</li>
                <li>Ask the developer in writing for a statement of account showing every payment you have made.</li>
                <li>
                  Look up the project on the state RERA website: its registered completion date, any extension and its progress reports. Our guide on{" "}
                  <Link href="/guides/check-a-project-on-maharera" className={link}>
                    checking a project on MahaRERA
                  </Link>{" "}
                  shows what each field means.
                </li>
                <li>Write to the developer about the delay and keep copies. Dates and receipts matter later.</li>
                <li>Speak to a property lawyer before you sign any new document or accept a new date, and before you decide between claiming interest and withdrawing.</li>
              </ol>
              <p className="mt-6 text-base leading-7 text-foreground/85">
                Not yet booked? The{" "}
                <Link href="/guides/agreement-for-sale-checklist" className={link}>
                  agreement for sale checklist
                </Link>{" "}
                covers the possession date, delay interest and cancellation clauses to read before you sign, and the{" "}
                <Link href="/tools/home-loan-emi-calculator" className={link}>
                  EMI calculator
                </Link>{" "}
                shows what a delay costs if you are also paying loan interest.
              </p>

              <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Questions buyers ask</h2>
              <FaqList items={DELAY_TOOL_FAQ} />

              <AdviceCta heading="Delayed flat? Talk it through with an advisor." />
              <p className="mt-10 text-xs leading-5 text-muted-foreground">
                {GENERAL_INFO_NOTE} This calculator is for information only. It is not legal advice and does not state what any authority or court will award.
              </p>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
