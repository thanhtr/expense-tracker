import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardStats, invalidateDashboardCache } from '../../lib/services/aggregation-service';

vi.mock('../../lib/db', () => ({
  prisma: {
    transaction: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    transactionSplit: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../../lib/db';

const DEFAULT_BY_CATEGORY = [
  { category: 'Shopping', _sum: { amount: -45.67 } },
  { category: 'Dining Out', _sum: { amount: -5.50 } },
  { category: 'Food & Groceries', _sum: { amount: -25.00 } },
];
const DEFAULT_BY_ACCOUNT = [
  { account: 'OP Bank', _sum: { amount: -51.17 } },
  { account: 'Amex', _sum: { amount: -25.00 } },
];
const DEFAULT_BY_PERSON = [
  { paidBy: 'tung', _sum: { amount: -51.17 } },
  { paidBy: 'thuy', _sum: { amount: -25.00 } },
];
const DEFAULT_BY_DAY_CAT = [
  { date: new Date('2026-04-10'), category: 'Shopping', _sum: { amount: -45.67 } },
  { date: new Date('2026-04-10'), category: 'Dining Out', _sum: { amount: -5.50 } },
  { date: new Date('2026-04-11'), category: 'Food & Groceries', _sum: { amount: -25.00 } },
];
const DEFAULT_TOP_TX = {
  merchant: 'Amazon', amount: -45.67, category: 'Shopping', date: new Date('2026-04-10'),
};

function setupMocks(opts: {
  byCategoryGroups?: { category: string; _sum: { amount: number } }[];
  byAccountGroups?: { account: string; _sum: { amount: number } }[];
  byPersonGroups?: { paidBy: string; _sum: { amount: number } }[];
  byDayCatGroups?: { date: Date; category: string; _sum: { amount: number } }[];
  totalAmount?: number;
  totalCount?: number;
  uncategorizedCount?: number;
  incomeAmount?: number;
  topTx?: typeof DEFAULT_TOP_TX | null;
} = {}) {
  const {
    byCategoryGroups = DEFAULT_BY_CATEGORY,
    byAccountGroups = DEFAULT_BY_ACCOUNT,
    byPersonGroups = DEFAULT_BY_PERSON,
    byDayCatGroups = DEFAULT_BY_DAY_CAT,
    totalAmount = -(45.67 + 5.50 + 25.00),
    totalCount = 3,
    uncategorizedCount = 0,
    incomeAmount = 0,
    topTx = DEFAULT_TOP_TX,
  } = opts;

  // groupBy called 5 times: category, account, paidBy, date×category, income sources
  vi.mocked(prisma.transaction.groupBy)
    .mockResolvedValueOnce(byCategoryGroups as never)
    .mockResolvedValueOnce(byAccountGroups as never)
    .mockResolvedValueOnce(byPersonGroups as never)
    .mockResolvedValueOnce(byDayCatGroups as never)
    .mockResolvedValueOnce([] as never); // income sources (empty by default)

  // aggregate called three times: expense totals, income, investments
  vi.mocked(prisma.transaction.aggregate)
    .mockResolvedValueOnce({ _sum: { amount: totalAmount }, _count: { id: totalCount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: incomeAmount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: 0 } } as never);

  vi.mocked(prisma.transaction.count).mockResolvedValueOnce(uncategorizedCount);
  vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce(topTx as never);
  vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([] as never); // income rows for byMonthIncome
}

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateDashboardCache();
  });

  it('should compute totalExpenses correctly', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.totalExpenses).toBeCloseTo(45.67 + 5.50 + 25.00);
  });

  it('should filter expenses by date range (passed to prisma where)', async () => {
    setupMocks({
      byCategoryGroups: [
        { category: 'Shopping', _sum: { amount: -45.67 } },
        { category: 'Dining Out', _sum: { amount: -5.50 } },
      ],
      byAccountGroups: [{ account: 'OP Bank', _sum: { amount: -(45.67 + 5.50) } }],
      byPersonGroups: [{ paidBy: 'tung', _sum: { amount: -(45.67 + 5.50) } }],
      byDayCatGroups: [
        { date: new Date('2026-04-10'), category: 'Shopping', _sum: { amount: -45.67 } },
        { date: new Date('2026-04-10'), category: 'Dining Out', _sum: { amount: -5.50 } },
      ],
      totalAmount: -(45.67 + 5.50),
      totalCount: 2,
    });

    const stats = await getDashboardStats(new Date('2026-04-10'), new Date('2026-04-10'));

    expect(stats.totalExpenses).toBeCloseTo(45.67 + 5.50);
    expect(vi.mocked(prisma.transaction.groupBy).mock.calls[0][0]).toMatchObject({
      where: { date: { gte: new Date('2026-04-10'), lte: new Date('2026-04-10') } },
    });
  });

  it('should aggregate by category', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.byCategory).toContainEqual({ category: 'Shopping', amount: 45.67 });
    expect(stats.byCategory).toContainEqual({ category: 'Dining Out', amount: 5.50 });
    expect(stats.byCategory).toContainEqual({ category: 'Food & Groceries', amount: 25.00 });
  });

  it('should sort byCategory by amount descending', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.byCategory[0].amount).toBe(45.67);
    expect(stats.byCategory[1].amount).toBe(25.00);
    expect(stats.byCategory[2].amount).toBe(5.50);
  });

  it('should aggregate by day with dynamic category keys', async () => {
    setupMocks();
    const stats = await getDashboardStats();

    const april10 = stats.byDay.find((d) => d.day === '2026-04-10');
    expect(april10).toBeDefined();
    expect(april10?.['Shopping']).toBe(45.67);
    expect(april10?.['Dining Out']).toBe(5.50);

    const april11 = stats.byDay.find((d) => d.day === '2026-04-11');
    expect(april11).toBeDefined();
    expect(april11?.['Food & Groceries']).toBe(25.00);
  });

  it('should include topTransaction', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.topTransaction).toBeDefined();
    expect(stats.topTransaction?.merchant).toBe('Amazon');
    expect(stats.topTransaction?.amount).toBe(45.67);
    expect(stats.topTransaction?.category).toBe('Shopping');
  });

  it('should count transactions', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.transactionCount).toBe(3);
  });

  it('should filter by category (passed to prisma where)', async () => {
    setupMocks({
      byCategoryGroups: [{ category: 'Shopping', _sum: { amount: -45.67 } }],
      byAccountGroups: [{ account: 'OP Bank', _sum: { amount: -45.67 } }],
      byPersonGroups: [{ paidBy: 'tung', _sum: { amount: -45.67 } }],
      byDayCatGroups: [
        { date: new Date('2026-04-10'), category: 'Shopping', _sum: { amount: -45.67 } },
      ],
      totalAmount: -45.67,
      totalCount: 1,
      topTx: { merchant: 'Amazon', amount: -45.67, category: 'Shopping', date: new Date('2026-04-10') },
    });

    const stats = await getDashboardStats(undefined, undefined, 'Shopping');

    expect(stats.totalExpenses).toBeCloseTo(45.67);
    expect(stats.transactionCount).toBe(1);
    expect(stats.byCategory[0].category).toBe('Shopping');
    expect(vi.mocked(prisma.transaction.groupBy).mock.calls[0][0]).toMatchObject({
      where: { category: 'Shopping' },
    });
  });

  it('should handle empty result', async () => {
    setupMocks({
      byCategoryGroups: [],
      byAccountGroups: [],
      byPersonGroups: [],
      byDayCatGroups: [],
      totalAmount: 0,
      totalCount: 0,
      topTx: null,
    });

    const stats = await getDashboardStats();

    expect(stats.totalExpenses).toBe(0);
    expect(stats.transactionCount).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });

  it('should populate allCategories from expense rows', async () => {
    setupMocks();
    const stats = await getDashboardStats();
    expect(stats.allCategories).toContain('Shopping');
    expect(stats.allCategories).toContain('Dining Out');
    expect(stats.allCategories).toContain('Food & Groceries');
  });
});
