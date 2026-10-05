import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BuyDirectFaq,
  BuyDirectSteps,
  breadcrumbStructuredData,
  faqStructuredData,
} from "@/components/buy-direct-guide-sections";
import { BUY_DIRECT_PATH, buyDirectFaq, buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "How to Buy Property Directly from the Developer | Developer Connects";
const DESCRIPTION =
  "How to buy a home directly from the developer in India and the UAE: find the developer's verified official website, check the project with the regulator, and deal with the developer's own sales team.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: BUY_DIRECT_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: BUY_DIRECT_PATH, siteName: "Developer Connects", type: "article" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function BuyDirectHubPage() {
  const markets = buyDirectMarkets();
  const faq = buyDirectFaq(null);
  const india = markets.filter((market) => market.location.country === "India");
  const uae = markets.filter((market) => market.location.country === "United Arab Emirates");

  const structuredData = [
    breadcrumbStructuredData([
      { name: "Home", path: "/" },
      { name: "Buy direct from developer", path: BUY_DIRECT_PATH },
    ]),
    faqStructuredData(faq),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <article className="mx-auto max-w-2xl">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-1">
                <li>
                  <Link href="/" className="hover:text-accent-hover hover:underline">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-foreground">
                  Buy direct from developer
                </li>
              </ol>
            </nav>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              How to buy property directly from the developer
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Developers sell new homes directly through their own sales teams — the hard part is making
              sure you are dealing with the real developer. This guide shows you how, step by step.
            </p>

            <div className="mt-6 rounded-lg border border-accent-soft bg-accent-soft/40 p-5">
              <p className="font-medium text-foreground">Start with a verified official website</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Developer Connects lists real estate developers in India and the UAE with the official
                website we have verified as theirs — so you can go straight to the source.
              </p>
              <Link
                href="/developers"
                className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                Browse verified developers
              </Link>
            </div>

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              Buying directly from the developer, step by step
            </h2>
            <BuyDirectSteps />

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              Buying direct vs. through an agent
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-5">
                <h3 className="font-medium text-foreground">Going direct</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Prices, offers and payment plans straight from the source</li>
                  <li>Contact the developer&apos;s own sales team</li>
                  <li>Confirm all terms and any fees with the developer in writing</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border p-5">
                <h3 className="font-medium text-foreground">Using a broker</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Can compare several developers&apos; projects for you</li>
                  <li>May help with paperwork and resale property</li>
                  <li>Check how they are paid and whether a fee applies</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Either way, verify the developer and the project yourself before you pay anything.
            </p>

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">Guides by location</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Each guide covers the regulator to check and lists that location&apos;s verified developers.
            </p>
            {[
              { heading: "India", items: india },
              { heading: "United Arab Emirates", items: uae },
            ].map((group) => (
              <div key={group.heading} className="mt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.heading}
                </h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.items.map((market) => (
                    <li key={market.slug}>
                      <Link href={buyDirectPath(market)} className="text-accent-hover hover:underline">
                        Buy directly from developers in {market.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <h2 className="mt-12 text-2xl font-semibold tracking-tight text-foreground">
              Frequently asked questions
            </h2>
            <BuyDirectFaq items={faq} />

            <p className="mt-8 text-xs text-muted-foreground">
              This guide is general information, not legal or financial advice. Developer Connects is an
              a directory of verified developer websites that also offers optional property assistance.{" "}
              <Link href="/how-we-verify" className="text-accent-hover hover:underline">
                How we verify official websites
              </Link>
            </p>
          </article>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
