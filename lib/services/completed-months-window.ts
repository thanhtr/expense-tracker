// Server-only: reads the earliest transaction date through Prisma (via aggregation-service.ts).
// Kept out of stats.ts, whose pure helpers are imported by app/trends/page.tsx, a client
// component — pulling a DB import into that file broke the client bundle (Can't resolve 'fs'/
// 'net'/'tls', from pg/Prisma leaking into Client Component Browser code).

import { getEarliestTransactionDate } from './aggregation-service';
import { monthString, monthRange } from './stats';

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
