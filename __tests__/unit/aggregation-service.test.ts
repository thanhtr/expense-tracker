import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardStats, invalidateDashboardCache } from '../../lib/services/aggregation-service';

vi.mock('../../lib/db', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/db';

const mockRows = [
  {
    id: 1,
    date: new Date('2026-04-10'),
    merchant: 'Amazon',
    amount: -45.67,
    account: 'OP Bank',
    category: 'Shopping',
    type: 'Expense',
    paidBy: 'tung',
    note: '',
    dedupKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    date: new Date('2026-04-10'),
    merchant: 'Starbucks',
    amount: -5.50,
    account: 'OP Bank',
    category: 'Dining Out',
    type: 'Expense',
    paidBy: 'tung',
    note: '',
    dedupKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    date: new Date('2026-04-11'),
    merchant: 'Grocery Store',
    amount: -25.00,
    account: 'Amex',
    category: 'Food & Groceries',
    type: 'Expense',
    paidBy: 'thuy',
    note: '',
    dedupKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateDashboardCache();
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 0 }, _avg: {}, _min: {}, _max: {}, _count: { _all: 0 } } as never);
  });

  it('should compute totalExpenses correctly', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.totalExpenses).toBeCloseTo(45.67 + 5.50 + 25.00);
  });

  it('should filter expenses by date range (passed to prisma where)', async () => {
    const filtered = mockRows.filter(r => r.date.toISOString().startsWith('2026-04-10'));
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(filtered);

    const stats = await getDashboardStats(new Date('2026-04-10'), new Date('2026-04-10'));

    expect(stats.totalExpenses).toBeCloseTo(45.67 + 5.50);
  });

  it('should aggregate by category', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.byCategory).toContainEqual({ category: 'Shopping', amount: 45.67 });
    expect(stats.byCategory).toContainEqual({ category: 'Dining Out', amount: 5.50 });
    expect(stats.byCategory).toContainEqual({ category: 'Food & Groceries', amount: 25.00 });
  });

  it('should sort byCategory by amount descending', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.byCategory[0].amount).toBe(45.67);
    expect(stats.byCategory[1].amount).toBe(25.00);
    expect(stats.byCategory[2].amount).toBe(5.50);
  });

  it('should aggregate by day with dynamic category keys', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

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
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.topTransaction).toBeDefined();
    expect(stats.topTransaction?.merchant).toBe('Amazon');
    expect(stats.topTransaction?.amount).toBe(45.67);
    expect(stats.topTransaction?.category).toBe('Shopping');
  });

  it('should count transactions', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.transactionCount).toBe(3);
  });

  it('should filter by category (passed to prisma where)', async () => {
    const filtered = mockRows.filter(r => r.category === 'Shopping');
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(filtered);

    const stats = await getDashboardStats(undefined, undefined, 'Shopping');

    expect(stats.totalExpenses).toBeCloseTo(45.67);
    expect(stats.transactionCount).toBe(1);
    expect(stats.byCategory[0].category).toBe('Shopping');
  });

  it('should handle empty result', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([]);

    const stats = await getDashboardStats();

    expect(stats.totalExpenses).toBe(0);
    expect(stats.transactionCount).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });

  it('should populate allCategories from all expense rows', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(mockRows);

    const stats = await getDashboardStats();

    expect(stats.allCategories).toContain('Shopping');
    expect(stats.allCategories).toContain('Dining Out');
    expect(stats.allCategories).toContain('Food & Groceries');
  });
});
