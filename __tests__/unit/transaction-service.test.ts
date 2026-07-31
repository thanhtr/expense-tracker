import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTransactions } from '../../lib/services/transaction-service';

vi.mock('../../lib/db', () => ({
  prisma: {
    transaction: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/db';

const makeRow = (overrides: Partial<{
  id: number; date: Date; merchant: string; amount: number; account: string;
  category: string; type: string; paidBy: string; note: string; dedupKey: string | null;
}> = {}) => ({
  id: 1,
  date: new Date('2026-04-10'),
  merchant: 'Amazon Purchase',
  amount: -45.67,
  account: 'OP Bank',
  category: 'Shopping',
  type: 'Expense',
  paidBy: 'tung',
  note: '',
  dedupKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('getTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all transactions without filters', async () => {
    const rows = [makeRow(), makeRow({ id: 2, merchant: 'Starbucks', amount: -5.50 }), makeRow({ id: 3, merchant: 'Grocery Store', amount: -25.00, paidBy: 'thuy', account: 'Amex' })];
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(3);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce(rows);

    const result = await getTransactions({});

    expect(result.total).toBe(3);
    expect(result.transactions).toHaveLength(3);
  });

  it('should return correct transaction shape', async () => {
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([makeRow()]);

    const result = await getTransactions({});
    const tx = result.transactions[0];

    expect(tx.id).toBe(1);
    expect(tx.merchant).toBe('Amazon Purchase');
    expect(tx.amount).toBe(-45.67);
    expect(tx.account).toBe('OP Bank');
    expect(tx.category).toBe('Shopping');
    expect(tx.type).toBe('Expense');
    expect(tx.paidBy).toBe('tung');
  });

  it('should respect limit and offset', async () => {
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(10);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([makeRow()]);

    const result = await getTransactions({ limit: 1, offset: 5 });

    expect(result.limit).toBe(1);
    expect(result.offset).toBe(5);
    expect(result.total).toBe(10);
  });

  it('should pass where filters to prisma', async () => {
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([]);

    await getTransactions({ account: 'OP Bank', category: 'Shopping', type: 'Expense', paidBy: 'tung' });

    const whereArg = vi.mocked(prisma.transaction.findMany).mock.calls[0][0]?.where;
    expect(whereArg?.account).toBe('OP Bank');
    expect(whereArg?.category).toBe('Shopping');
    expect(whereArg?.type).toBe('Expense');
    expect(whereArg?.paidBy).toBe('tung');
  });

  it('should pass merchant as insensitive contains filter', async () => {
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([]);

    await getTransactions({ merchant: 'amazon' });

    const whereArg = vi.mocked(prisma.transaction.findMany).mock.calls[0][0]?.where;
    expect(whereArg?.merchant).toEqual({ contains: 'amazon', mode: 'insensitive' });
  });

  it('should default to date desc sort', async () => {
    vi.mocked(prisma.transaction.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([]);

    await getTransactions({});

    const orderArg = vi.mocked(prisma.transaction.findMany).mock.calls[0][0]?.orderBy;
    expect(orderArg).toEqual({ date: 'desc' });
  });
});
