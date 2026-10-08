import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import type { RecurringCharge, RecurringExclusion } from '@/lib/types';

export type { RecurringCharge, RecurringExclusion };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

// `since` is the real rolling-1-year boundary, truncated to a local day by the exported wrapper
// below and passed in as a genuine argument (not recomputed from `new Date()` inside this body) —
// so the cache key and the actual query window always agree. An earlier version recomputed
// `since` internally and only passed a throwaway month-granularity key, which froze the window at
// whatever moment the cache was first populated that month: by the end of the month, the window
// had silently drifted up to ~30 days wider than the documented 1 year. Tagged with both 'data'
// (the transactions themselves) and 'config' (RecurringExclusion rows).
const detectRecurringCharges = unstable_cache(
  async (since: Date) => {
    const [rows, exclusions] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: 'Expense', date: { gte: since } },
      select: { merchant: true, amount: true, date: true, category: true, account: true },
      orderBy: { date: 'asc' },
      take: 10000,
    }),
    prisma.recurringExclusion.findMany(),
  ]);

  const excludedCategories = new Set(
    exclusions.filter(e => e.type === 'category').map(e => e.value)
  );
  const excludedMerchants = new Set(
    exclusions.filter(e => e.type === 'merchant').map(e => e.value)
  );

  const byMerchant = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.merchant;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key)!.push(row);
  }

  const recurring: RecurringCharge[] = [];

  for (const [merchant, txs] of byMerchant) {
    // Need 3+ months with at least one charge each
    const months = new Set(txs.map(t => t.date.toISOString().slice(0, 7)));
    if (months.size < 3) continue;

    // Check that the months are consecutive (or close): max gap ≤ 2 months
    const sortedMonths = [...months].sort();
    let maxGap = 0;
    for (let i = 1; i < sortedMonths.length; i++) {
      const [py, pm] = (sortedMonths[i - 1] ?? '').split('-').map(Number);
      const [cy, cm] = (sortedMonths[i] ?? '').split('-').map(Number);
      const gap = ((cy ?? 0) - (py ?? 0)) * 12 + ((cm ?? 0) - (pm ?? 0));
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap > 2) continue; // gap > 2 months = not regular

    const amounts = txs.map(t => Math.abs(t.amount));
    const med = median(amounts);
    const lastTx = txs[txs.length - 1]!;
    const category = lastTx.category || 'Other';

    if (excludedMerchants.has(merchant) || excludedCategories.has(category)) continue;

    recurring.push({
      merchant,
      category,
      medianAmount: med,
      monthlyEstimate: med,
      occurrences: months.size,
      lastDate: lastTx.date.toISOString().slice(0, 10),
      account: lastTx.account,
    });
  }

    recurring.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);

    const totalMonthly = recurring.reduce((s, r) => s + r.monthlyEstimate, 0);

    return { recurring, totalMonthly, count: recurring.length, exclusions };
  },
  ['recurring-charges'],
  { tags: ['data', 'config'], revalidate: false },
);

export async function GET(): Promise<NextResponse> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setFullYear(since.getFullYear() - 1);
  return NextResponse.json(await detectRecurringCharges(since));
}
