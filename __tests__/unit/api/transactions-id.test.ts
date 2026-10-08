import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    transaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('../../../lib/services/learned-rules-service', () => ({
  recordCorrection: vi.fn(),
}));
vi.mock('../../../lib/categories-cache', () => ({
  getCategoriesCached: vi.fn(async () => ['Groceries', 'Dining Out']),
}));

import { PATCH, DELETE } from '../../../app/api/transactions/[id]/route';
import { prisma } from '../../../lib/db';
import { revalidateTag } from 'next/cache';

const makeReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/transactions/[id]', () => {
  it('invalidates the data cache on a successful category edit (regression)', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValueOnce({ id: 1, merchant: 'Shop', amount: -10 } as never);
    vi.mocked(prisma.transaction.update).mockResolvedValueOnce({ category: 'Groceries', tags: [] } as never);

    const res = await PATCH(
      makeReq('http://localhost/api/transactions/1', 'PATCH', { category: 'Groceries' }),
      { params: params('1') },
    );

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('data', { expire: 0 });
  });

  it('does not invalidate the cache when the transaction is not found', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValueOnce(null);

    const res = await PATCH(
      makeReq('http://localhost/api/transactions/999', 'PATCH', { category: 'Groceries' }),
      { params: params('999') },
    );

    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/transactions/[id]', () => {
  it('invalidates the data cache on delete (regression)', async () => {
    vi.mocked(prisma.transaction.delete).mockResolvedValueOnce({} as never);

    const res = await DELETE(makeReq('http://localhost/api/transactions/1', 'DELETE'), { params: params('1') });

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('data', { expire: 0 });
  });
});
