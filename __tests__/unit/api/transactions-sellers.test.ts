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

  it('excludes linked reimbursement transactions from the merchant queries themselves', async () => {
    // Regression test: previously merchantGroups summed ALL Expense-type rows per
    // merchant, so a linked reimbursement sharing its expense's merchant name would
    // already be netted by the DB sum, and then netted a second time by
    // reimbursedByMerchant — silently understating that merchant's true total.
    vi.mocked(prisma.transaction.groupBy)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([] as never);

    await GET();

    expect(vi.mocked(prisma.transaction.groupBy).mock.calls[0][0]).toMatchObject({
      where: { type: 'Expense', reimbursementLink: null },
    });
    expect(vi.mocked(prisma.transaction.groupBy).mock.calls[1][0]).toMatchObject({
      where: { type: 'Expense', reimbursementLink: null },
    });
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
