// Small statistical helpers shared by anything doing Monte Carlo / bootstrap simulation
// (fire-monte-carlo.ts, forecast-service.ts), plus the shared rolling-window resolver below.

import { getEarliestTransactionDate } from './aggregation-service';

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

// unstable_cache keys on the literal argument values, order included — sorting a copy here lets
// two selections of the same set in a different order (e.g. MultiSelectDropdown builds its array
// in click order, not sorted) share one cache entry instead of each recomputing separately.
// Shared by aggregation-service.ts and transaction-service.ts, which both multi-select-filter by
// category/account.
export function sortedOrUndefined(arr?: string[]): string[] | undefined {
  return arr ? [...arr].sort() : arr;
}

export interface CompletedMonthsWindow {
  windowStart: Date;
  windowEnd: Date;
  months: string[];
}

/** Resolves a rolling N-completed-calendar-months window (never a partial current month),
 * clamped to the earliest transaction actually in the DB. Shared by forecast-service.ts and
 * points-goal-enrichment.ts, which both need "how far back does reliable history go" —
 * previously duplicated independently in each.
 *
 * `emptyHistoryFallback` controls what happens when the DB has no transactions at all
 * (`getEarliestTransactionDate` returns null): `'full-window'` (default) falls back to the full
 * rolling window — a fresh/empty database's null earliest date must never fall through to a
 * null `gte` Date filter, but a caller that only needs window *bounds* (e.g. a capacity
 * calculation that will just compute zeros over it) is fine treating "no data" as "the whole
 * window is empty". `'single-month'` collapses to the narrowest possible window instead, for a
 * caller that gates on history *length* (e.g. forecast-service's minimum-history check, which
 * should treat zero real transactions as having no usable history, not a full 12 months of it). */
export async function resolveCompletedMonthsWindow(
  windowMonths: number,
  opts: { emptyHistoryFallback?: 'full-window' | 'single-month' } = {},
): Promise<CompletedMonthsWindow> {
  const { emptyHistoryFallback = 'full-window' } = opts;
  const now = new Date();
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // last day of previous month
  const windowEndMonth = monthString(windowEnd);

  const rollingStart = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1);
  rollingStart.setMonth(rollingStart.getMonth() - (windowMonths - 1));

  const earliestDataDate = await getEarliestTransactionDate();

  if (earliestDataDate === null && emptyHistoryFallback === 'single-month') {
    return { windowStart: windowEnd, windowEnd, months: [windowEndMonth] };
  }

  const earliestDataMonth = earliestDataDate ? monthString(earliestDataDate) : null;
  const dataStartsLater = earliestDataMonth !== null && earliestDataMonth > monthString(rollingStart);
  const windowStart = dataStartsLater ? earliestDataDate! : rollingStart;

  const months = monthRange(dataStartsLater ? earliestDataMonth! : monthString(rollingStart), windowEndMonth);

  return { windowStart, windowEnd, months };
}
