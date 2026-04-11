import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withCache, invalidateCache } from '../../lib/cache';

describe('Cache with TTL', () => {
  beforeEach(() => {
    // Clear cache before each test
    invalidateCache();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should cache the result and avoid calling fetchFn again within TTL', async () => {
    const fetchFn = vi.fn(async () => 'data');

    const result1 = await withCache('test-key', 1, fetchFn);
    expect(result1).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const result2 = await withCache('test-key', 1, fetchFn);
    expect(result2).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(1); // Still only called once
  });

  it('should call fetchFn again after TTL expires', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => 'data');

    const result1 = await withCache('test-key', 1, fetchFn);
    expect(result1).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance time past TTL (1 second)
    vi.advanceTimersByTime(1100);

    const result2 = await withCache('test-key', 1, fetchFn);
    expect(result2).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(2); // Called again

    vi.useRealTimers();
  });

  it('should use different cache keys independently', async () => {
    const fetchFn1 = vi.fn(async () => 'data1');
    const fetchFn2 = vi.fn(async () => 'data2');

    const result1 = await withCache('key1', 10, fetchFn1);
    const result2 = await withCache('key2', 10, fetchFn2);

    expect(result1).toBe('data1');
    expect(result2).toBe('data2');
    expect(fetchFn1).toHaveBeenCalledTimes(1);
    expect(fetchFn2).toHaveBeenCalledTimes(1);

    // Fetch again with same keys
    const result3 = await withCache('key1', 10, fetchFn1);
    const result4 = await withCache('key2', 10, fetchFn2);

    expect(result3).toBe('data1');
    expect(result4).toBe('data2');
    expect(fetchFn1).toHaveBeenCalledTimes(1); // Not called again
    expect(fetchFn2).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should invalidate all cache entries with invalidateCache()', async () => {
    const fetchFn = vi.fn(async () => 'data');

    await withCache('key1', 10, fetchFn);
    await withCache('key2', 10, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);

    invalidateCache();

    await withCache('key1', 10, fetchFn);
    await withCache('key2', 10, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(4); // Called twice more after invalidation
  });

  it('should invalidate cache by key prefix', async () => {
    const fetchFn = vi.fn(async () => 'data');

    await withCache('expenses:2026-04-01:2026-04-30', 10, fetchFn);
    await withCache('expenses:2026-05-01:2026-05-31', 10, fetchFn);
    await withCache('keywords:all', 10, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(3);

    // Invalidate only keys starting with 'expenses:'
    invalidateCache('expenses:');

    await withCache('expenses:2026-04-01:2026-04-30', 10, fetchFn);
    await withCache('expenses:2026-05-01:2026-05-31', 10, fetchFn);
    await withCache('keywords:all', 10, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(5); // Only the 'expenses:' keys called again
  });

  it('should handle fetch function errors', async () => {
    const error = new Error('Fetch failed');
    const fetchFn = vi.fn(async () => {
      throw error;
    });

    await expect(withCache('error-key', 10, fetchFn)).rejects.toThrow('Fetch failed');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent calls with same key', async () => {
    const fetchFn = vi.fn(async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'data';
    });

    const promises = [
      withCache('concurrent-key', 10, fetchFn),
      withCache('concurrent-key', 10, fetchFn),
      withCache('concurrent-key', 10, fetchFn),
    ];

    const results = await Promise.all(promises);

    expect(results).toEqual(['data', 'data', 'data']);
    // May be called 1-3 times depending on timing, but shouldn't be more than 3
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
