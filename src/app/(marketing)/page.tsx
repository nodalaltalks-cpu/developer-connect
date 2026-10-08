import { SHARE_IMAGES } from "@/lib/share-image";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroVideo } from "@/components/hero-video";
import { HeroMarketProvider, HeroMarketToggle } from "@/components/hero-market";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { FeaturedDevelopers, type FeaturedCard } from "@/components/featured-developers";
import { FounderSection } from "@/components/founder-section";
import { LoginConversionPrompt } from "@/components/login-conversion-prompt";
import { ContinueResearch } from "@/components/continue-research";
import { BuyerJourney } from "@/components/buyer-journey";
import { marketFromParams } from "@/lib/hero-market";
import { FEATURED_DEVELOPERS, FEATURED_SELECTION_NOTE } from "@/lib/featured-developers";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDeveloperBySlug } from "@/lib/developer-connect/search-service";
import { getRecentlyViewedDevelopers } from "@/lib/developer-connect/recently-viewed";
import { readSessionId } from "@/lib/session";
import { buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TITLE = "Developer Connects | Property Research and Advisory for Mumbai and Dubai";
const DESCRIPTION =
  "Research first. Get expert help when you are ready. Developer Connects is a property research and advisory firm for buyers in India and the UAE, led by Ambish Singh.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

/**
 * WebSite JSON-LD lives here because it describes the site's entry point (the homepage). Organization markup is site-wide in the
 * root layout. Deliberately no SearchAction (that feature is retired) and no Review markup (there are no published reviews).
 */
const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Developer Connects",
  alternateName: "DeveloperConnects",
  url: "https://developerconnects.com/",
};

const WHY = [
  "Prices, payment plans and handover dates are rarely laid out side by side.",
  "The developer’s own sales pitch is not research.",
  "Most buyers are asked for a phone number before they have learned anything.",
] as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const heroMarket = marketFromParams({
    market: firstValue(params.market),
    country: firstValue(params.country),
    state: firstValue(params.state),
    city: firstValue(params.city),
  });

  const { userId } = await auth();
  const sessionId = await readSessionId();
  const repos = createPostgresRepositories();

  // Featured names, each looked up as a public developer: one that is not public simply does not appear.
  const [featuredProfiles, recentlyViewed] = await Promise.all([
    Promise.all(FEATURED_DEVELOPERS.map((entry) => getPublicDeveloperBySlug(repos, entry.slug))),
    getRecentlyViewedDevelopers(repos, { userId: userId ?? undefined, sessionId: sessionId ?? undefined }),
  ]);
  const cards: FeaturedCard[] = FEATURED_DEVELOPERS.flatMap((entry, i) => {
    const profile = featuredProfiles[i];
    return profile ? [{ slug: profile.slug, name: profile.displayName, market: entry.market, place: `${profile.city}, ${profile.country}`, logo: entry.logo }] : [];
  });

  const guides = buyDirectMarkets().filter((m) => m.location.city);

  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }} />
      <SiteHeader />

      <main className="flex-1">
        <HeroMarketProvider fromAddress={heroMarket}>
          {/* HERO: footage under a scrim, so its text is fixed white. Two lines, two actions, nothing else. */}
          <section className="relative isolate overflow-hidden text-white">
            <HeroVideo />
            <Container className="relative py-24 sm:py-36 lg:py-44">
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80 sm:text-sm">Mumbai &middot; Dubai</p>
                <HeroMarketToggle />
                <h1 className="mt-6 text-balance font-serif text-4xl font-medium leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl">
                  Research first.
                  <span className="block text-white/90">Get expert help when you&rsquo;re ready.</span>
                </h1>
                <p className="mt-5 text-lg text-white/85 sm:text-xl">Property decisions, without the usual noise.</p>
                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <AdvisorTrigger className="w-full sm:w-auto">Talk to an Advisor</AdvisorTrigger>
                  <Link
                    href="/developers"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/50 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
                  >
                    Explore Developers
                  </Link>
                </div>
              </div>
            </Container>
          </section>

          {/* WHAT WE DO + WHY BUYERS NEED IT */}
          <Container className="py-16 sm:py-24">
            <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">What we do</p>
                <h2 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
                  Calm, clear research on Mumbai and Dubai property.
                </h2>
                <p className="mt-4 text-base leading-7 text-foreground/80">
                  Developer Connects is a property research and advisory firm. You explore developers and markets on your own, privately, and speak to a person only when you choose to.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Why it matters</p>
                <ul className="mt-3 space-y-4">
                  {WHY.map((line) => (
                    <li key={line} className="border-l-2 border-gold pl-4 text-base leading-7 text-foreground/85">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>

          <BuyerJourney />

          {/* RESEARCH: featured developers, then the way into everything else */}
          <Container className="py-16 sm:py-24">
            <ContinueResearch developers={recentlyViewed} />
            <FeaturedDevelopers cards={cards} note={FEATURED_SELECTION_NOTE} />
            <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-border p-2">
              <SearchBox />
            </div>
          </Container>

          {/* HUMAN EXPERTISE */}
          <Container className="pb-16 sm:pb-24">
            <FounderSection />
          </Container>
        </HeroMarketProvider>

        {/* TRUST: evidence the visitor can check, not a badge */}
        <section aria-labelledby="trust-heading" className="border-y border-border bg-muted/50">
          <Container className="py-14 sm:py-20">
            <div className="mx-auto max-w-5xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">How we earn your trust</p>
              <h2 id="trust-heading" className="mt-3 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                Things you can check for yourself
              </h2>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { title: "A named person", body: "You speak to Ambish Singh, whose profile is public.", href: "/about", cta: "About us" },
                  { title: "Direct contact", body: "WhatsApp, email and phone, with the numbers shown plainly.", href: "/contact", cta: "Contact" },
                  { title: "Clear policies", body: "How your details are used, and the terms of using the site.", href: "/privacy", cta: "Privacy policy" },
                  { title: "Research notes", body: "Written guides for buying in Mumbai, Dubai and across India and the UAE.", href: buyDirectPath(), cta: "Read the guides" },
                ].map((item) => (
                  <li key={item.title} className="border-t border-border pt-4">
                    <p className="text-base font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                      {item.cta} →
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-xs text-muted-foreground">Research reviewed October 2026.</p>
            </div>
          </Container>
        </section>

        {/* CLOSE */}
        <Container className="py-16 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">Have a property in mind?</h2>
            <p className="mt-3 text-base text-muted-foreground">Ask Ambish. No form, no pressure.</p>
            <div className="mt-8 flex justify-center">
              <AdvisorTrigger tone="navy">Talk to an Advisor</AdvisorTrigger>
            </div>
            <ul className="mt-10 flex flex-wrap justify-center gap-x-6 text-sm">
              {guides.map((market) => (
                <li key={market.slug}>
                  <Link href={buyDirectPath(market)} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
                    Researching {market.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </main>

      <SiteFooter />
      {!userId && <LoginConversionPrompt />}
    </div>
  );
}
