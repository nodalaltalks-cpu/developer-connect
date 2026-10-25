import { SHARE_IMAGES } from "@/lib/share-image";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";
import { EmployeeHomeRedirect } from "@/components/employee-home-redirect";
import { SiteFooter } from "@/components/site-footer";
import { HeroVideo } from "@/components/hero-video";
import { HeroMarketProvider, HeroMarketToggle } from "@/components/hero-market";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { FeaturedDevelopers, type FeaturedCard } from "@/components/featured-developers";
import { FounderSection } from "@/components/founder-section";
import { PublishedTestimonials } from "@/components/published-testimonials";
import { ContinueResearch } from "@/components/continue-research";
import { BuyerJourney } from "@/components/buyer-journey";
import { GuidesStrip } from "@/components/guides-strip";
import { ProofBand } from "@/components/proof-band";
import { marketFromParams } from "@/lib/hero-market";
import { FEATURED_DEVELOPERS, FEATURED_SELECTION_NOTE } from "@/lib/featured-developers";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { cachedPublicDeveloperBySlug } from "@/lib/developer-connect/cached-public";
import { getRecentlyViewedDevelopers } from "@/lib/developer-connect/recently-viewed";
import { readSessionId } from "@/lib/session";
import { buyDirectMarkets, buyDirectPath } from "@/lib/developer-connect/buy-direct-guides";
import { SocialVideoSection } from "@/components/social/social-video-section";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TITLE = "Developer Connects | Know before you buy. Property advice for Mumbai and Dubai";
const DESCRIPTION =
  "Know before you buy. Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by Ambish Singh: every price, payment plan and possession date laid out before you commit.";

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
    Promise.all(FEATURED_DEVELOPERS.map((entry) => cachedPublicDeveloperBySlug(entry.slug))),
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
      <EmployeeHomeRedirect />
      <SiteHeader />

      <main className="flex-1">
        <HeroMarketProvider fromAddress={heroMarket}>
          {/* HERO: the film under a scrim, so its text is fixed white. The promise, who stands behind it, two actions. */}
          <section className="relative isolate overflow-hidden text-white">
            <HeroVideo />
            <Container className="relative z-10 py-24 sm:py-36 lg:py-44">
              <div className="mx-auto max-w-3xl text-center">
                <HeroMarketToggle />
                <h1 className="dc-rise mt-6 text-balance font-serif text-[clamp(2.5rem,1.6rem+4.5vw,5rem)] font-medium leading-[1.04] tracking-[-0.02em]" style={{ "--dc-delay": "80ms" } as React.CSSProperties}>
                  Know before you buy.
                </h1>
                <p className="dc-rise mt-5 text-lg text-pearl sm:text-xl" style={{ "--dc-delay": "180ms" } as React.CSSProperties}>
                  Property research and advice for Mumbai and Dubai, led by Ambish Singh.
                </p>
                <div className="dc-rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ "--dc-delay": "280ms" } as React.CSSProperties}>
                  <AdvisorTrigger size="hero" className="w-full sm:w-auto">Talk to an Advisor</AdvisorTrigger>
                  <Link
                    href="/developers"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-white/60 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
                  >
                    Explore Developers
                  </Link>
                </div>
                <div className="dc-rise mt-9 flex flex-col items-center gap-2" style={{ "--dc-delay": "380ms" } as React.CSSProperties}>
                  <p className="flex items-center gap-3 text-sm text-pearl">
                    <Image src="/founder/ambish-singh-avatar.jpg" alt="" width={40} height={40} className="size-10 rounded-full border border-brass-300/70 object-cover" />
                    <span className="font-semibold">Ambish Singh, Founder</span>
                  </p>
                  <ul className="flex flex-col items-center gap-0.5 text-sm text-pearl sm:flex-row sm:gap-3">
                    <li>MBA in Strategy</li>
                    <li aria-hidden="true" className="hidden text-white/40 sm:block">&middot;</li>
                    <li>6+ years of experience in real estate across India &amp; UAE</li>
                  </ul>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-brass-300">Your choice &middot; My priority</p>
                </div>
              </div>
            </Container>
          </section>

          <ProofBand />
          <BuyerJourney />

          {/* RESEARCH: featured developers, then the way into everything else */}
          <Container className="defer-section py-16 sm:py-24">
            <ContinueResearch developers={recentlyViewed} />
            <FeaturedDevelopers cards={cards} note={FEATURED_SELECTION_NOTE} />
            <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-white p-2">
              <SearchBox />
            </div>
          </Container>

          {/* HUMAN EXPERTISE */}
          <Container className="pb-16 sm:pb-24">
            <FounderSection />
          </Container>
        </HeroMarketProvider>

        <PublishedTestimonials />

        <GuidesStrip />

        {/* WATCH: the Founder's best videos, vertical and horizontal, each opening the post on Instagram */}
        <SocialVideoSection />

        {/* CLOSE */}
        <Container className="py-16 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">Have a property in mind?</h2>
            <p className="mt-3 text-base text-muted-foreground">Message Ambish, or tap your requirements. No pressure.</p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <AdvisorTrigger tone="navy">Talk to an Advisor</AdvisorTrigger>
              <Link href="/enquire" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                Or just tap your requirements in 60 seconds →
              </Link>
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
    </div>
  );
}
