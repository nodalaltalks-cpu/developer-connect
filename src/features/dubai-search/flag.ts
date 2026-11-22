/**
 * Feature flag for the Dubai Property Search experiment. Off unless DUBAI_SEARCH_ENABLED=true is set in the environment, so a
 * deploy without the variable shows nothing: no nav link, no homepage section, and the route answers 404.
 * Server-side only (read in server components); the browser code never needs it.
 */
export function dubaiSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DUBAI_SEARCH_ENABLED === "true";
}

export const DUBAI_SEARCH_PATH = "/dubai-property-search";
