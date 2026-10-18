/**
 * Which city's film the homepage hero shows. Dubai is the default for a first visit. The choice comes, in order, from:
 *  1. the page address (a Mumbai / Dubai location filter or ?market=), so a link or a filter always shows its own city;
 *  2. the visitor's last choice on this device (kept only in their own browser);
 *  3. Dubai.
 * Plain module (no React) so the server page and the client components share one definition.
 */
export type Market = "dubai" | "mumbai";
export const MARKETS: readonly Market[] = ["mumbai", "dubai"] as const;
export const DEFAULT_MARKET: Market = "dubai";
export const MARKET_STORAGE_KEY = "dc_hero_market";

const MUMBAI_CITIES = ["mumbai", "navi mumbai", "thane", "mumbai suburban"];

/** Maps the homepage's own search parameters to a market, or null when they say nothing about one. */
export function marketFromParams(params: { market?: string; country?: string; state?: string; city?: string }): Market | null {
  const direct = params.market?.trim().toLowerCase();
  if (direct === "dubai" || direct === "mumbai") return direct;
  const city = params.city?.trim().toLowerCase();
  if (city && MUMBAI_CITIES.includes(city)) return "mumbai";
  if (city === "dubai" || params.country?.trim().toLowerCase() === "united arab emirates") return "dubai";
  return null;
}

export function isMarket(value: unknown): value is Market {
  return value === "dubai" || value === "mumbai";
}

export type HeroConnection = { saveData?: boolean; effectiveType?: string; downlink?: number };

/**
 * Which cut of the hero film to fetch for this screen and connection: a portrait cut for phones, a light 720p cut on a slow link
 * (Chrome reports downlink in Mbit/s, capped at 10; other browsers report nothing and are treated as fast), and the full 4K cut
 * only for 4K-class screens on a fast link. Each cut's bitrate sits below the link speed that selects it (4K about 8 Mbit/s,
 * 1440p about 4.5, 1080p about 3, 720p about 1.2), so a film that starts playing never stalls.
 */
export function cutFor(screen: { portrait: boolean; pixelWidth: number }, connection: HeroConnection | undefined): string {
  if (screen.portrait) return "tall-1080";
  const downlink = connection?.downlink;
  if (downlink !== undefined && downlink < 2) return "wide-720";
  if (screen.pixelWidth >= 3000 && (downlink === undefined || downlink >= 8)) return "wide-2160";
  if (screen.pixelWidth >= 2200 && (downlink === undefined || downlink >= 6)) return "wide-1440";
  return "wide-1080";
}

/** Every cut the encoder produces for each city (see components/hero-video.tsx). */
export const HERO_CUTS = ["tall-1080", "wide-720", "wide-1080", "wide-1440", "wide-2160"] as const;
export const HERO_STILLS = ["still-tall.avif", "still-1920.avif", "still-3840.avif", "still-1920.jpg"] as const;
