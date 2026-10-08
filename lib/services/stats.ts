// Small statistical helpers shared by anything doing Monte Carlo / bootstrap simulation
// (fire-monte-carlo.ts, forecast-service.ts).

// Deterministic PRNG (mulberry32), so results are stable across reloads/tests for a
// given seed, with no external dependency.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller.
export function randNormal(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx]!;
}

// Formats a Date as a 'YYYY-MM' string using local date components, not toISOString():
// converting a local midnight to UTC rolls back to the previous day (and sometimes
// month) in any positive-UTC-offset timezone, which would silently corrupt month
// arithmetic for callers that round-trip through this.
export function monthString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Shifts a 'YYYY-MM' string by a number of calendar months (negative to go back).
export function shiftMonth(month: string, delta: number): string {
  const [y, mo] = month.split('-').map(Number);
  return monthString(new Date(y!, mo! - 1 + delta, 1));
}

// Builds the list of calendar months from `start` to `end` inclusive, as 'YYYY-MM' strings.
export function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let m = start;
  while (m <= end) {
    months.push(m);
    m = shiftMonth(m, 1);
  }
  return months;
}

// Formats a Date as a 'YYYY-MM-DD' string using local date components, not toISOString() — same
// reasoning as monthString above, one level finer-grained. Used as an unstable_cache argument by
// anything that needs its cache key to roll over at local midnight, not UTC midnight (a real bug,
// independently reintroduced twice in this codebase before this helper was centralized — see
// PROJECT_SUMMARY.md's caching section).
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
