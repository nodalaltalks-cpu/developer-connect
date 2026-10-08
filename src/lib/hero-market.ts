/**
 * Which city's film the homepage hero shows. Dubai is the default for a first visit. The choice comes, in order, from:
 *  1. the page address (a Mumbai / Dubai location filter or ?market=), so a link or a filter always shows its own city;
 *  2. the visitor's last choice on this device (kept only in their own browser);
 *  3. Dubai.
 * Plain module (no React) so the server page and the client components share one definition.
 */
export type Market = "dubai" | "mumbai";
export const MARKETS: readonly Market[] = ["dubai", "mumbai"] as const;
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
