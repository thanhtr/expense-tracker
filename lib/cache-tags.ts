import { revalidateTag as nextRevalidateTag } from 'next/cache';

// The three cache domains this app's `unstable_cache`-wrapped functions are tagged with — see
// PROJECT_SUMMARY.md's caching section for the full design. Centralized here (instead of each
// mutation route passing its own bare string literal to next/cache's revalidateTag) so a typo'd
// or renamed tag fails to compile instead of silently creating a cache entry nothing invalidates.
export const CACHE_TAGS = ['data', 'readings', 'config'] as const;
export type CacheTag = typeof CACHE_TAGS[number];

/** Typed wrapper around Next's `revalidateTag`, restricted to this app's three cache tags and
 * always using an immediate, blocking invalidation (`{ expire: 0 }`) rather than a named
 * cache-life profile like `'max'` — passing a profile string takes Next's stale-while-revalidate
 * path (the *next* read can still return the old value), not an immediate one. */
export function revalidateTag(tag: CacheTag): void {
  nextRevalidateTag(tag, { expire: 0 });
}
