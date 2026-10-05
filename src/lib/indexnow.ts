/**
 * IndexNow — tells participating search engines (Bing, Yandex, Seznam,
 * Naver; Bing's index also feeds ChatGPT search and Copilot) that a URL is
 * new or changed, so it is recrawled in minutes instead of whenever the
 * crawler next happens by. One ping to api.indexnow.org is shared with every
 * participating engine.
 *
 * The key is public by design: IndexNow proves site ownership by fetching
 * `/{key}.txt` from this host (public/6458ee28fbd1a3c25ac75cfcccd8ffba.txt),
 * whose content must equal the key. Never throws — indexing is a
 * best-effort side effect and must never fail the action that triggered it.
 */
const HOST = "developerconnects.com";
const BASE_URL = `https://${HOST}`;
export const INDEXNOW_KEY = "6458ee28fbd1a3c25ac75cfcccd8ffba";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow's per-request limit. */
const MAX_URLS_PER_REQUEST = 10_000;

/** Submits site paths (e.g. "/developers/acme") or absolute URLs on this host. Returns the HTTP status codes, one per batch. */
export async function submitToIndexNow(pathsOrUrls: string[]): Promise<number[]> {
  const urls = [...new Set(pathsOrUrls.map((value) => (value.startsWith("http") ? value : `${BASE_URL}${value}`)))].filter(
    (url) => url.startsWith(BASE_URL),
  );
  // Only production should announce URLs; previews and local runs would point engines at the live host for no reason.
  if (urls.length === 0 || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];

  const statuses: number[] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
          urlList: urls.slice(i, i + MAX_URLS_PER_REQUEST),
        }),
      });
      statuses.push(response.status);
    } catch {
      statuses.push(0);
    }
  }
  return statuses;
}
