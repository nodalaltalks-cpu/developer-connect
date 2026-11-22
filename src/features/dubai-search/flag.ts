/**
 * Dubai Property Search is a permanent part of the site. It is ON unless DUBAI_SEARCH_ENABLED is set to "false", which is a kill switch:
 * the nav link, homepage section and every page under /dubai-property-search then disappear (the pages answer 404).
 * Server-side only (read in server components); the browser code never needs it.
 */
export function dubaiSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DUBAI_SEARCH_ENABLED !== "false";
}

export const DUBAI_SEARCH_PATH = "/dubai-property-search";
