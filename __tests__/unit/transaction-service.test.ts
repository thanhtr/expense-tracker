import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTransactions } from '../../lib/services/transaction-service';

vi.mock('../../lib/splitwise', () => ({
  getAllExpenses: vi.fn(),
}));

vi.mock('../../lib/cache', () => ({
  withCache: vi.fn((_key, _ttl, fetchFn) => fetchFn()),
}));

import * as splitwise from '../../lib/splitwise';

describe('getTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockExpenses = [
    {
      id: 1,
      date: '2026-04-10',
      description: 'Amazon Purchase',
      cost: '45.67',
      category: { id: 41, name: 'Shopping' },
      users: [
        { user_id: 123, paid_share: 45.67, owed_share: 22.835 },
        { user_id: 456, paid_share: 0, owed_share: 22.835 },
      ],
      deleted_at: null,
      details: JSON.stringify({ account: 'OP Bank', category: 'Shopping' }),
    } as any,
    {
      id: 2,
      date: '2026-04-10',
      description: 'Starbucks',
      cost: '5.50',
      category: { id: 13, name: 'Dining Out' },
      users: [
        { user_id: 123, paid_share: 5.50, owed_share: 2.75 },
        { user_id: 456, paid_share: 0, owed_share: 2.75 },
      ],
      deleted_at: null,
      details: JSON.stringify({ account: 'OP Bank', category: 'Dining Out' }),
    } as any,
    {
      id: 3,
      date: '2026-04-11',
      description: 'Grocery Store',
      cost: '25.00',
      category: { id: 12, name: 'Food & Groceries' },
      users: [
        { user_id: 456, paid_share: 25.00, owed_share: 12.5 },
        { user_id: 123, paid_share: 0, owed_share: 12.5 },
      ],
      deleted_at: null,
      details: JSON.stringify({ account: 'Amex', category: 'Food & Groceries' }),
    } as any,
  ];

  it('should return all transactions without filters', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({});

    expect(result.total).toBe(3);
    expect(result.transactions).toHaveLength(3);
  });

  it('should filter by date range', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      dateFrom: '2026-04-10',
      dateTo: '2026-04-10',
    });

    expect(result.total).toBe(2);
    expect(result.transactions[0].date).toEqual(new Date('2026-04-10'));
  });

  it('should filter by account', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      account: 'OP Bank',
    });

    expect(result.total).toBe(2);
    expect(result.transactions.every((t) => t.account === 'OP Bank')).toBe(true);
  });

  it('should filter by category', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      category: 'Shopping',
    });

    expect(result.total).toBe(1);
    expect(result.transactions[0].category).toBe('Shopping');
  });

  it('should filter by merchant (substring match)', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      merchant: 'starbucks',
    });

    expect(result.total).toBe(1);
    expect(result.transactions[0].merchant).toBe('Starbucks');
  });

  it('should filter by merchant case-insensitively', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      merchant: 'AMAZON',
    });

    expect(result.total).toBe(1);
    expect(result.transactions[0].merchant).toBe('Amazon Purchase');
  });

  it('should filter by paidBy (user)', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      paidBy: 'thuy', // user_id 456
    });

    expect(result.total).toBe(1);
    expect(result.transactions[0].paidBy).toBe('thuy');
  });

  it('should handle pagination with limit and offset', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      limit: 2,
      offset: 0,
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);

    const result2 = await getTransactions({
      limit: 2,
      offset: 2,
    });

    expect(result2.transactions).toHaveLength(1);
    expect(result2.offset).toBe(2);
  });

  it('should sort by date descending by default', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({});

    expect(result.transactions[0].date).toEqual(new Date('2026-04-11'));
    expect(result.transactions[1].date).toEqual(new Date('2026-04-10'));
  });

  it('should sort by date ascending when order specified', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      sortBy: 'date',
      order: 'asc',
    });

    expect(result.transactions[0].date).toEqual(new Date('2026-04-10'));
    expect(result.transactions[1].date).toEqual(new Date('2026-04-11'));
  });

  it('should sort by amount field', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      sortBy: 'amount',
      order: 'desc',
    });

    expect(result.transactions[0].amount).toBe(-45.67);
    expect(result.transactions[2].amount).toBe(-5.50);
  });

  it('should return correct total count', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({
      limit: 2,
      offset: 0,
    });

    expect(result.total).toBe(3); // Total should be count of all matching, not page size
  });

  it('should determine paidBy correctly for each transaction', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce(mockExpenses as any);

    const result = await getTransactions({});

    expect(result.transactions[0].paidBy).toBe('tung'); // user 123
    expect(result.transactions[2].paidBy).toBe('thuy'); // user 456
  });

  it('should handle empty results', async () => {
    vi.mocked(splitwise.getAllExpenses).mockResolvedValueOnce([] as any);

    const result = await getTransactions({});

    expect(result.total).toBe(0);
    expect(result.transactions).toHaveLength(0);
  });
});
