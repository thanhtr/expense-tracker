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
    transactionLink: {
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
  investmentsAmount?: number;
  internalTransfersAmount?: number;
  topTx?: typeof DEFAULT_TOP_TX | null;
  reimbByCategoryGroups?: { category: string; _sum: { amount: number } }[];
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
    investmentsAmount = 0,
    internalTransfersAmount = 0,
    topTx = DEFAULT_TOP_TX,
    reimbByCategoryGroups = [],
  } = opts;

  // groupBy called 6 times: category, account, paidBy, date×category, income sources, reimb by category
  vi.mocked(prisma.transaction.groupBy)
    .mockResolvedValueOnce(byCategoryGroups as never)
    .mockResolvedValueOnce(byAccountGroups as never)
    .mockResolvedValueOnce(byPersonGroups as never)
    .mockResolvedValueOnce(byDayCatGroups as never)
    .mockResolvedValueOnce([] as never) // income sources (empty by default)
    .mockResolvedValueOnce(reimbByCategoryGroups as never); // reimb by category (empty by default)

  // aggregate called five times: outflow totals, income, investments, internalTransfer, reimbursements
  vi.mocked(prisma.transaction.aggregate)
    .mockResolvedValueOnce({ _sum: { amount: totalAmount }, _count: { id: totalCount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: incomeAmount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: investmentsAmount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: internalTransfersAmount } } as never)
    .mockResolvedValueOnce({ _sum: { amount: 0 } } as never); // reimbursements

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

  it('should net a linked Income-type reimbursement against its expense category, moving it from income into reimbursements without changing net', async () => {
    setupMocks({
      byCategoryGroups: [{ category: 'Dining Out', _sum: { amount: -80 } }],
      byAccountGroups: [{ account: 'OP Bank', _sum: { amount: -80 } }],
      byPersonGroups: [{ paidBy: 'tung', _sum: { amount: -80 } }],
      byDayCatGroups: [{ date: new Date('2026-04-10'), category: 'Dining Out', _sum: { amount: -80 } }],
      totalAmount: -80,
      totalCount: 1,
      incomeAmount: 30,
      topTx: { merchant: 'Restaurant X', amount: -80, category: 'Dining Out', date: new Date('2026-04-10') },
    });
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      { expenseTransaction: { category: 'Dining Out' }, reimbursementTransaction: { type: 'Income', amount: 30 } },
    ] as never);

    const statsWithoutLink = { totalIncome: 30, totalReimbursements: 0 };
    const stats = await getDashboardStats();

    expect(stats.byCategory.find(c => c.category === 'Dining Out')?.amount).toBeCloseTo(50); // 80 - 30
    expect(stats.totalIncome).toBe(0);
    expect(stats.totalReimbursements).toBe(30);
    // net is invariant to the income/reimbursement reclassification
    expect(stats.net).toBeCloseTo(statsWithoutLink.totalIncome - 80 + statsWithoutLink.totalReimbursements);
  });

  it('should not double-net a linked positive-amount Expense reimbursement already covered by the blanket same-category convention', async () => {
    setupMocks({
      byCategoryGroups: [{ category: 'Dining Out', _sum: { amount: -80 } }],
      byAccountGroups: [{ account: 'OP Bank', _sum: { amount: -80 } }],
      byPersonGroups: [{ paidBy: 'tung', _sum: { amount: -80 } }],
      byDayCatGroups: [{ date: new Date('2026-04-10'), category: 'Dining Out', _sum: { amount: -80 } }],
      totalAmount: -80,
      totalCount: 1,
      topTx: { merchant: 'Restaurant X', amount: -80, category: 'Dining Out', date: new Date('2026-04-10') },
      reimbByCategoryGroups: [{ category: 'Dining Out', _sum: { amount: 30 } }],
    });
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      { expenseTransaction: { category: 'Dining Out' }, reimbursementTransaction: { type: 'Expense', amount: 30 } },
    ] as never);

    const stats = await getDashboardStats();

    expect(stats.byCategory.find(c => c.category === 'Dining Out')?.amount).toBeCloseTo(50); // 80 - 30, not 80 - 60
  });
});
