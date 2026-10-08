import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    transaction: { findUnique: vi.fn() },
    transactionSplit: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { PUT } from '../../../app/api/transactions/[id]/splits/route';
import { prisma } from '../../../lib/db';
import { revalidateTag } from 'next/cache';

const makeReq = (body: unknown) =>
  new NextRequest('http://localhost/api/transactions/1/splits', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/transactions/[id]/splits', () => {
  it('invalidates the data cache on a successful split update (regression)', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValueOnce({ id: 1 } as never);
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValueOnce([
      { id: 1, transactionId: 1, category: 'Groceries', amount: 20 },
    ] as never);

    const res = await PUT(
      makeReq({ splits: [{ category: 'Groceries', amount: 20 }] }),
      { params: params('1') },
    );

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('data', { expire: 0 });
  });

  it('does not invalidate the cache when the transaction is not found', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValueOnce(null);

    const res = await PUT(
      makeReq({ splits: [{ category: 'Groceries', amount: 20 }] }),
      { params: params('999') },
    );

    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
