"use client";

import Image from "next/image";
import Link from "next/link";
import { useHeroMarket } from "@/components/hero-market";
import type { Market } from "@/lib/hero-market";

/**
 * Featured developers, by market. The market is the visitor's own choice (the same one the hero film uses, kept in their own
 * browser), so picking Mumbai once makes the whole homepage lean Mumbai. Cards are large and quiet: the name, the place and
 * one clear action. No metrics, no badges, no invented credentials.
 */

export interface FeaturedCard {
  slug: string;
  name: string;
  market: Market;
  place: string;
  logo?: string;
}

const LABEL: Record<Market, string> = { mumbai: "Mumbai", dubai: "Dubai" };

export function FeaturedDevelopers({ cards, note }: { cards: FeaturedCard[]; note: string }) {
  const { market, select } = useHeroMarket();
  const shown = cards.filter((c) => c.market === market);
  const markets = (["mumbai", "dubai"] as const).filter((m) => cards.some((c) => c.market === m));

  return (
    <section aria-labelledby="featured-heading" className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Developers to explore</p>
          <h2 id="featured-heading" className="mt-2 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Start with the names that shape the market
          </h2>
        </div>
        <div role="tablist" aria-label="Market" className="inline-flex rounded-full border border-border p-1">
          {markets.map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={market === m}
              onClick={() => select(m)}
              className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${market === m ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}
            >
              {LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          Featured {LABEL[market]} developers will appear here shortly.{" "}
          <Link href="/developers" className="font-medium text-accent-hover underline">
            Browse every developer
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((card) => (
            <li key={card.slug}>
              <Link
                href={`/developers/${card.slug}`}
                className="group flex h-full min-h-48 flex-col justify-between rounded-2xl border border-border bg-background p-6 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  {card.logo ? (
                    <Image src={card.logo} alt={`${card.name} logo`} width={160} height={56} className="h-12 w-auto object-contain object-left" />
                  ) : (
                    <p className="font-serif text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl">{card.name}</p>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">{card.place}</p>
                </div>
                <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
                  <span className="text-muted-foreground">Developer profile · Market context</span>
                  <span className="font-semibold text-accent-hover group-hover:underline">Explore →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 max-w-3xl text-xs leading-5 text-muted-foreground">{note}</p>
      <p className="mt-3">
        <Link href="/developers" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
          Browse every developer →
        </Link>
      </p>
    </section>
  );
}
