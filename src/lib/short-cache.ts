/**
 * Keeps one answer for a few seconds per key, so several browser tabs (or many polls) asking the same question cost the database one
 * read instead of one each. A failed read is never kept. Per server instance, in memory.
 */
const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function shortCache<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = read();
  entries.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  if (entries.size > 500) for (const [k, v] of entries) if (Date.now() - v.at > ttlMs) entries.delete(k);
  return value;
}
