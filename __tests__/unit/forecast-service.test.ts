import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
}));

import { getDashboardStats } from '@/lib/services/aggregation-service';
import { forecastNextMonth } from '@/lib/services/forecast-service';
import { FORECAST_RELIABLE_HISTORY_START } from '@/lib/constants';

// Mirrors forecast-service's own month arithmetic, so fixtures line up with whatever
// window the service actually computes. Uses local date components, not toISOString():
// converting a local midnight to UTC rolls back to the previous day (and sometimes
// month) in any positive-UTC-offset timezone.
function monthString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  return monthString(new Date(y!, m! - 1 + delta, 1));
}
function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let m = start;
  while (m <= end) {
    months.push(m);
    m = addMonths(m, 1);
  }
  return months;
}

function historyMonths(): string[] {
  const now = new Date();
  const historyEnd = monthString(new Date(now.getFullYear(), now.getMonth(), 0));
  return monthRange(FORECAST_RELIABLE_HISTORY_START.slice(0, 7), historyEnd);
}

// Pins "now" so the service's history window is exactly `monthCount` months long
// (FORECAST_RELIABLE_HISTORY_START + monthCount), regardless of the real current date —
// needed for tests whose probability math depends on a small, exact window size.
async function withFixedWindow<T>(monthCount: number, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    const fixedNow = new Date(FORECAST_RELIABLE_HISTORY_START);
    fixedNow.setMonth(fixedNow.getMonth() + monthCount);
    vi.setSystemTime(fixedNow);
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

function makeStats(months: string[], opts: { constantCategory?: number; rareCategoryMonth?: string; rareCategoryAmount?: number } = {}) {
  const { constantCategory = 100, rareCategoryMonth, rareCategoryAmount = 500 } = opts;
  const byMonth = months.map(month => ({
    month,
    amount: constantCategory + (month === rareCategoryMonth ? rareCategoryAmount : 0),
  }));
  const byCategoryMonth = months.map(month => {
    const row: Record<string, number | string> = { month, Constant: constantCategory };
    if (rareCategoryMonth && month === rareCategoryMonth) row.Rare = rareCategoryAmount;
    return row;
  });
  return {
    totalExpenses: 0, totalIncome: 0, totalInvestments: 0, totalInternalTransfers: 0,
    totalReimbursements: 0, net: 0, byCategory: [], byAccount: {}, byPerson: [],
    byMonth, byMonthIncome: [], byCategoryMonth, byDay: [], refundsByDay: [], refundsByMonth: [],
    uncategorizedCount: 0, allCategories: [], topTransactions: [], transactionCount: 0, byIncomeSource: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('forecastNextMonth', () => {
  it('a category with the same amount every month gets a zero-width band at that amount', async () => {
    const months = historyMonths();
    vi.mocked(getDashboardStats).mockResolvedValueOnce(makeStats(months) as never);

    const result = await forecastNextMonth();
    if ('insufficientData' in result) throw new Error('expected a forecast, got insufficientData');

    const constant = result.byCategory.find(c => c.category === 'Constant');
    expect(constant).toBeDefined();
    expect(constant!.p10).toBe(100);
    expect(constant!.p50).toBe(100);
    expect(constant!.p90).toBe(100);
    expect(constant!.monthsWithData).toBe(months.length);
  });

  it('a category present in only one of three months gets a zero median and a positive p90 reflecting the rare spike', async () => {
    // A fixed 3-month window (not the real "now"-derived one): the rare category's
    // 1-in-3 occurrence probability keeps this comfortably away from the p90 cutoff
    // (far more than the ~100-of-1000 trials needed to push p90 off zero), unlike a
    // 1-in-9 window where the expected hit count sits right at that boundary and the
    // outcome would depend on exactly how the fixed seed happens to land.
    await withFixedWindow(3, async () => {
      const months = historyMonths();
      expect(months.length).toBe(3);
      const rareMonth = months[0]!;
      vi.mocked(getDashboardStats).mockResolvedValueOnce(
        makeStats(months, { rareCategoryMonth: rareMonth, rareCategoryAmount: 500 }) as never,
      );

      const result = await forecastNextMonth();
      if ('insufficientData' in result) throw new Error('expected a forecast, got insufficientData');

      const rare = result.byCategory.find(c => c.category === 'Rare');
      expect(rare).toBeDefined();
      expect(rare!.monthsWithData).toBe(1);
      expect(rare!.p50).toBe(0);
      expect(rare!.p90).toBeGreaterThan(0);
    });
  });

  it('returns insufficientData when fewer than 3 history months are available', async () => {
    await withFixedWindow(2, async () => {
      const result = await forecastNextMonth();

      expect('insufficientData' in result).toBe(true);
      if ('insufficientData' in result) expect(result.monthsAvailable).toBe(2);
      expect(getDashboardStats).not.toHaveBeenCalled();
    });
  });

  it('is deterministic for repeated calls', async () => {
    const months = historyMonths();
    vi.mocked(getDashboardStats).mockResolvedValue(makeStats(months, { rareCategoryMonth: months[0], rareCategoryAmount: 500 }) as never);

    const a = await forecastNextMonth();
    const b = await forecastNextMonth();
    expect(a).toEqual(b);
  });

  it('sorts categories by median descending', async () => {
    const months = historyMonths();
    const stats = makeStats(months);
    // Add a second, larger constant category directly on the fixture.
    for (const row of stats.byCategoryMonth) row.Bigger = 9000;
    stats.byMonth = stats.byMonth.map(m => ({ ...m, amount: m.amount + 9000 }));
    vi.mocked(getDashboardStats).mockResolvedValueOnce(stats as never);

    const result = await forecastNextMonth();
    if ('insufficientData' in result) throw new Error('expected a forecast, got insufficientData');

    expect(result.byCategory[0]!.category).toBe('Bigger');
  });
});
