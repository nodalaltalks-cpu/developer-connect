import type { Listing, SearchFilters } from "./types.ts";

/**
 * Everything the visitor keeps (saved properties, saved searches, history, listings they added, local analytics) lives only in this
 * browser's localStorage. Nothing is sent anywhere and no sign-in is needed. Every read and write is guarded: storage can be missing
 * or full, and the page must still work.
 */
const PREFIX = "dcds:v1:";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: carry on without remembering.
  }
}

export interface SavedSearch {
  id: string;
  filters: SearchFilters;
  savedAt: string;
}

export const LIMITS = { saved: 100, searches: 20, history: 10, recent: 12, userListings: 600, events: 300 } as const;

/** Newest first, no repeats, capped. */
export function pushRecent(list: readonly string[], id: string, max: number): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export function toggle(list: readonly string[], id: string, max: number): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, max);
}

export function filtersKey(f: SearchFilters): string {
  return JSON.stringify([f.query.trim().toLowerCase(), f.purpose, [...f.propertyTypes].sort(), [...f.bedrooms].sort(), f.minPrice, f.maxPrice, f.completion, f.furnished, f.minArea, f.maxArea, [...f.sources].sort()]);
}

export function describeFilters(f: SearchFilters): string {
  const parts = [f.query.trim() || "Dubai", f.purpose === "buy" ? "Buy" : "Rent"];
  if (f.bedrooms.length) parts.push(f.bedrooms.map((b) => (b === 0 ? "Studio" : b >= 4 ? "4+ bed" : `${b} bed`)).join(", "));
  if (f.maxPrice !== null) parts.push(`up to AED ${f.maxPrice.toLocaleString("en-US")}`);
  if (f.completion !== "any") parts.push(f.completion === "ready" ? "Ready" : "Off-plan");
  return parts.join(" · ");
}

export function addSearch(list: readonly SavedSearch[], filters: SearchFilters, nowIso: string, max: number): SavedSearch[] {
  const key = filtersKey(filters);
  if (list.some((s) => filtersKey(s.filters) === key)) return [...list];
  return [{ id: `s-${nowIso}`, filters, savedAt: nowIso }, ...list].slice(0, max);
}

export function mergeUserListings(existing: readonly Listing[], added: readonly Listing[], max: number): Listing[] {
  const seen = new Set(existing.map((l) => l.id));
  return [...existing, ...added.filter((l) => !seen.has(l.id))].slice(-max);
}
