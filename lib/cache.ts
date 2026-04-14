/**
 * Simple in-memory TTL cache for Splitwise API responses
 * Module-level store persists across requests within a warm Node.js process
 * On serverless/Vercel, this helps reduce redundant API calls during a session
 */

type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

// Deduplicates concurrent requests for the same cache key:
// if two callers miss the cache at the same time, only one fetch is made
const pending = new Map<string, Promise<unknown>>();

/**
 * Execute a fetch function with TTL caching
 * If a non-expired entry exists, return it; otherwise fetch, cache, and return.
 * Concurrent callers with the same key share a single in-flight fetch.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && now < entry.expiresAt) {
    console.log(`✓ Cache hit: ${key}`);
    return entry.value;
  }

  // Return the already-in-flight promise if one exists for this key
  if (pending.has(key)) {
    console.log(`⏳ Cache miss: ${key}, joining in-flight fetch...`);
    return pending.get(key) as Promise<T>;
  }

  console.log(`⏳ Cache miss: ${key}, fetching...`);
  const promise = fetchFn().then((value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return value;
  }).finally(() => {
    pending.delete(key);
  });

  pending.set(key, promise);
  return promise;
}

/**
 * Invalidate cache entries by key prefix
 * Pass 'expenses:' to clear all date-keyed expense entries
 */
export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    console.log(`🗑️ Cache cleared (all entries)`);
    store.clear();
    return;
  }

  let count = 0;
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key);
      count++;
    }
  }
  console.log(`🗑️ Cache cleared (${count} entries matching '${keyPrefix}')`);
}
