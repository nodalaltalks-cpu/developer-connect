"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_MARKET, MARKETS, MARKET_STORAGE_KEY, isMarket, type Market } from "@/lib/hero-market";

interface HeroMarketValue {
  market: Market;
  select: (market: Market) => void;
  /** The market the visitor is about to choose (hovering or focusing its button): its film starts loading early. */
  warm: Market | null;
  setWarm: (market: Market | null) => void;
}

const HeroMarketContext = createContext<HeroMarketValue>({ market: DEFAULT_MARKET, select: () => {}, warm: null, setWarm: () => {} });

export function useHeroMarket(): HeroMarketValue {
  return useContext(HeroMarketContext);
}

export function HeroMarketProvider({ fromAddress, children }: { fromAddress: Market | null; children: ReactNode }) {
  const [market, setMarket] = useState<Market>(fromAddress ?? DEFAULT_MARKET);
  const [warm, setWarm] = useState<Market | null>(null);

  // The address wins whenever it names a market (including when a filter changes it).
  useEffect(() => {
    if (fromAddress) setMarket(fromAddress);
  }, [fromAddress]);

  // With no market in the address, return visitors get the city they last chose.
  useEffect(() => {
    if (fromAddress) return;
    try {
      const stored = window.localStorage.getItem(MARKET_STORAGE_KEY);
      if (isMarket(stored)) setMarket(stored);
    } catch {
      // storage blocked: keep the default
    }
  }, [fromAddress]);

  const select = useCallback((next: Market) => {
    setMarket(next);
    try {
      window.localStorage.setItem(MARKET_STORAGE_KEY, next);
    } catch {
      // never let storage break the page
    }
  }, []);

  const value = useMemo(() => ({ market, select, warm, setWarm }), [market, select, warm]);
  return <HeroMarketContext.Provider value={value}>{children}</HeroMarketContext.Provider>;
}

const LABELS: Record<Market, string> = { dubai: "Dubai", mumbai: "Mumbai" };

/** Two large pills (a radio group): Dubai and Mumbai. Touch-sized, keyboard-operable, and counted as tracked buttons. */
export function HeroMarketToggle() {
  const { market, select, setWarm } = useHeroMarket();
  return (
    <div role="radiogroup" aria-label="Choose a city" className="mt-7 inline-flex rounded-full bg-white/10 p-1 ring-1 ring-white/25 backdrop-blur">
      {MARKETS.map((m) => {
        const active = market === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            data-cta={m === "dubai" ? "hero_market_dubai" : "hero_market_mumbai"}
            onClick={() => select(m)}
            onPointerEnter={() => setWarm(m)}
            onFocus={() => setWarm(m)}
            onTouchStart={() => setWarm(m)}
            className={`min-h-11 min-w-28 rounded-full px-6 text-sm font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              active ? "bg-white text-slate-900" : "text-white hover:bg-white/10"
            }`}
          >
            {LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
