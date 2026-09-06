import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/db', () => ({
  prisma: {
    transaction: {
      groupBy: vi.fn(),
    },
    transactionLink: {
      findMany: vi.fn(),
    },
  },
}));

import { GET } from '../../../app/api/transactions/sellers/route';
import { prisma } from '../../../lib/db';

describe('GET /api/transactions/sellers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nets a linked reimbursement against the expense merchant, not the reimbursement merchant', async () => {
    vi.mocked(prisma.transaction.groupBy)
      .mockResolvedValueOnce([
        { merchant: 'Restaurant X', _count: { id: 1 }, _sum: { amount: -80 } },
      ] as never)
      .mockResolvedValueOnce([
        { merchant: 'Restaurant X', category: 'Dining Out', _count: { id: 1 } },
      ] as never);
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      {
        expenseTransaction: { merchant: 'Restaurant X' },
        reimbursementTransaction: { amount: 30 },
      },
    ] as never);

    const res = await GET();
    const body = await res.json();

    const restaurant = body.sellers.find((s: { merchant: string }) => s.merchant === 'Restaurant X');
    expect(restaurant.totalAmount).toBe(50); // 80 - 30
    expect(restaurant.reimbursedAmount).toBe(30);
  });

  it('leaves totalAmount unreduced and reimbursedAmount unset for a merchant with no links', async () => {
    vi.mocked(prisma.transaction.groupBy)
      .mockResolvedValueOnce([
        { merchant: 'Grocery Store', _count: { id: 2 }, _sum: { amount: -50 } },
      ] as never)
      .mockResolvedValueOnce([
        { merchant: 'Grocery Store', category: 'Food & Groceries', _count: { id: 2 } },
      ] as never);
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([] as never);

    const res = await GET();
    const body = await res.json();

    const grocery = body.sellers.find((s: { merchant: string }) => s.merchant === 'Grocery Store');
    expect(grocery.totalAmount).toBe(50);
    expect(grocery.reimbursedAmount).toBeUndefined();
  });

  it('does not let reimbursements push totalAmount below zero', async () => {
    vi.mocked(prisma.transaction.groupBy)
      .mockResolvedValueOnce([
        { merchant: 'Restaurant X', _count: { id: 1 }, _sum: { amount: -80 } },
      ] as never)
      .mockResolvedValueOnce([
        { merchant: 'Restaurant X', category: 'Dining Out', _count: { id: 1 } },
      ] as never);
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      {
        expenseTransaction: { merchant: 'Restaurant X' },
        reimbursementTransaction: { amount: 200 },
      },
    ] as never);

    const res = await GET();
    const body = await res.json();

    const restaurant = body.sellers.find((s: { merchant: string }) => s.merchant === 'Restaurant X');
    expect(restaurant.totalAmount).toBe(0);
  });
});
