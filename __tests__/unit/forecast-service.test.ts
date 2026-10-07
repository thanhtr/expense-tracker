import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
  getEarliestTransactionDate: vi.fn(),
}));

import { getDashboardStats, getEarliestTransactionDate } from '@/lib/services/aggregation-service';
import { forecastNextMonth } from '@/lib/services/forecast-service';

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

// Last full calendar month before "now", as the service computes `historyEnd`.
function historyEndMonth(): string {
  const now = new Date();
  return monthString(new Date(now.getFullYear(), now.getMonth(), 0));
}

// Builds the exact `monthCount`-long window the service would use when the earliest
// transaction is `monthCount - 1` months before `historyEnd` (so data never reaches back
// the full rolling-12 default) — the window is then "as far as the data goes".
function historyMonths(monthCount: number): string[] {
  const end = historyEndMonth();
  const start = addMonths(end, -(monthCount - 1));
  return monthRange(start, end);
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

// Sets the mocked earliest-transaction date so the service's window ends up exactly
// `monthCount` months long (never more, since the rolling cap is 12).
function setEarliestDataMonths(monthCount: number) {
  const end = historyEndMonth();
  const startMonth = addMonths(end, -(monthCount - 1));
  const [y, m] = startMonth.split('-').map(Number);
  vi.mocked(getEarliestTransactionDate).mockResolvedValue(new Date(y!, m! - 1, 1));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('forecastNextMonth', () => {
  it('a category with the same amount every month gets a zero-width band at that amount', async () => {
    const months = historyMonths(12);
    setEarliestDataMonths(12);
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

  it('caps the window at 12 months even when more history exists', async () => {
    const months = historyMonths(12);
    // Data actually goes back 24 months, but the window should still be capped at 12.
    setEarliestDataMonths(24);
    vi.mocked(getDashboardStats).mockResolvedValueOnce(makeStats(months) as never);

    const result = await forecastNextMonth();
    if ('insufficientData' in result) throw new Error('expected a forecast, got insufficientData');

    expect(result.basedOnMonths).toBe(12);
    expect(getDashboardStats).toHaveBeenCalledTimes(1);
    const [calledFrom] = vi.mocked(getDashboardStats).mock.calls[0]!;
    expect(monthString(calledFrom as Date)).toBe(months[0]);
  });

  it('a category present in only one of three months gets a zero median and a positive p90 reflecting the rare spike', async () => {
    // A short, exact 3-month window (less than the full history actually available): the
    // rare category's 1-in-3 occurrence probability keeps this comfortably away from the
    // p90 cutoff (far more than the ~100-of-1000 trials needed to push p90 off zero),
    // unlike a 1-in-9 window where the expected hit count sits right at that boundary and
    // the outcome would depend on exactly how the fixed seed happens to land.
    const months = historyMonths(3);
    setEarliestDataMonths(3);
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

  it('returns insufficientData when fewer than 3 history months are available, without fetching stats', async () => {
    setEarliestDataMonths(2);

    const result = await forecastNextMonth();

    expect('insufficientData' in result).toBe(true);
    if ('insufficientData' in result) expect(result.monthsAvailable).toBe(2);
    expect(getDashboardStats).not.toHaveBeenCalled();
  });

  it('treats no transactions at all as insufficient data', async () => {
    vi.mocked(getEarliestTransactionDate).mockResolvedValue(null);

    const result = await forecastNextMonth();

    expect('insufficientData' in result).toBe(true);
    if ('insufficientData' in result) expect(result.monthsAvailable).toBe(1);
    expect(getDashboardStats).not.toHaveBeenCalled();
  });

  it('is deterministic for repeated calls', async () => {
    const months = historyMonths(12);
    setEarliestDataMonths(12);
    vi.mocked(getDashboardStats).mockResolvedValue(makeStats(months, { rareCategoryMonth: months[0], rareCategoryAmount: 500 }) as never);

    const a = await forecastNextMonth();
    const b = await forecastNextMonth();
    expect(a).toEqual(b);
  });

  it('sorts categories by median descending', async () => {
    const months = historyMonths(12);
    setEarliestDataMonths(12);
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
