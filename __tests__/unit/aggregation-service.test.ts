import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardStats } from '../../lib/services/aggregation-service';

// Mock the splitwise module
vi.mock('../../lib/splitwise', () => ({
  getAllExpenses: vi.fn(),
}));

vi.mock('../../lib/cache', () => ({
  withCache: vi.fn((_key, _ttl, fetchFn) => fetchFn()),
}));

import * as splitwise from '../../lib/splitwise';

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockExpenses = [
    {
      id: 1,
      date: '2026-04-10',
      description: 'Amazon',
      cost: '45.67',
      category: { id: 41, name: 'Shopping' },
      users: [{ user_id: 123, paid_share: 45.67 }],
      deleted_at: null,
      details: null,
    } as any,
    {
      id: 2,
      date: '2026-04-10',
      description: 'Starbucks',
      cost: '5.50',
      category: { id: 13, name: 'Dining Out' },
      users: [{ user_id: 123, paid_share: 5.50 }],
      deleted_at: null,
      details: null,
    } as any,
    {
      id: 3,
      date: '2026-04-11',
      description: 'Grocery Store',
      cost: '25.00',
      category: { id: 12, name: 'Food & Groceries' },
      users: [{ user_id: 123, paid_share: 25.00 }],
      deleted_at: null,
      details: null,
    } as any,
  ];

  it('should compute totalExpenses correctly', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.totalExpenses).toBe(45.67 + 5.50 + 25.00);
  });

  it('should filter expenses by date range', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const dateFrom = new Date('2026-04-10');
    const dateTo = new Date('2026-04-10');

    const stats = await getDashboardStats(dateFrom, dateTo);

    // Should include only the two from 2026-04-10
    expect(stats.totalExpenses).toBe(45.67 + 5.50);
  });

  it('should aggregate by category', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.byCategory).toContainEqual({ category: 'Shopping', amount: 45.67 });
    expect(stats.byCategory).toContainEqual({ category: 'Dining Out', amount: 5.50 });
    expect(stats.byCategory).toContainEqual({ category: 'Food & Groceries', amount: 25.00 });
  });

  it('should sort byCategory by amount descending', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.byCategory[0].amount).toBe(45.67); // Highest
    expect(stats.byCategory[1].amount).toBe(25.00);
    expect(stats.byCategory[2].amount).toBe(5.50); // Lowest
  });

  it('should aggregate by day with dynamic category keys', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

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
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.topTransaction).toBeDefined();
    expect(stats.topTransaction?.merchant).toBe('Amazon');
    expect(stats.topTransaction?.amount).toBe(45.67);
    expect(stats.topTransaction?.category).toBe('Shopping');
  });

  it('should count transactions', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.transactionCount).toBe(3);
  });

  it('should filter by category', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats(undefined, undefined, 'Shopping');

    expect(stats.totalExpenses).toBe(45.67);
    expect(stats.transactionCount).toBe(1);
    expect(stats.byCategory[0].category).toBe('Shopping');
  });

  it('should skip deleted expenses', async () => {
    const expensesWithDeleted = [
      ...mockExpenses,
      {
        id: 4,
        date: '2026-04-12',
        description: 'Deleted Expense',
        cost: '100.00',
        category: { id: 1, name: 'Utilities' },
        users: [{ user_id: 123, paid_share: 100.00 }],
        deleted_at: '2026-04-13',
        details: null,
      } as any,
    ];

    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(expensesWithDeleted as any);

    const stats = await getDashboardStats();

    expect(stats.transactionCount).toBe(3); // Deleted one not counted
    expect(stats.totalExpenses).toBe(45.67 + 5.50 + 25.00);
  });

  it('should handle empty expenses', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce([] as any);

    const stats = await getDashboardStats();

    expect(stats.totalExpenses).toBe(0);
    expect(stats.transactionCount).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });

  it('should populate allCategories from unfiltered data', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const stats = await getDashboardStats();

    expect(stats.allCategories).toContain('Shopping');
    expect(stats.allCategories).toContain('Dining Out');
    expect(stats.allCategories).toContain('Food & Groceries');
  });
});
