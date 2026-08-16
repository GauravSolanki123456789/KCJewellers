/**
 * Short-lived in-memory dedupe for identical GET requests (catalog, rates, public settings).
 * Prevents duplicate parallel fetches from layout + cart + search on the same page load.
 */
type CacheEntry = { data: unknown; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 45_000;

function cacheKey(url: string): string {
  return url.replace(/\/$/, "");
}

export function cachedGet<T>(
  url: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const key = cacheKey(url);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) {
    return Promise.resolve(hit.data as T);
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCachedGet(url: string): void {
  const key = cacheKey(url);
  cache.delete(key);
  inflight.delete(key);
}
