import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/services/transaction-service', () => ({
  getTransactions: vi.fn(),
}));

import { GET } from '../../../app/api/export/route';
import { getTransactions } from '../../../lib/services/transaction-service';

const makeReq = () => new NextRequest('http://localhost/api/export');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/export', () => {
  it('formats a transaction date returned as a real Date instance', async () => {
    vi.mocked(getTransactions).mockResolvedValueOnce({
      transactions: [{ id: 1, date: new Date('2026-04-10'), account: 'OP Bank', merchant: 'Shop', amount: -10, type: 'Expense', category: 'Groceries', paidBy: 'tung', tags: [], note: '', createdAt: new Date(), updatedAt: new Date() }],
      total: 1,
      limit: 10000,
      offset: 0,
      sum: -10,
    } as never);

    const res = await GET(makeReq());
    const csv = await res.text();
    expect(csv).toContain('2026-04-10');
  });

  it('formats a transaction date returned as a plain string (regression: getTransactions is cached via unstable_cache, which serializes Date fields into strings on a cache hit)', async () => {
    vi.mocked(getTransactions).mockResolvedValueOnce({
      transactions: [{ id: 1, date: '2026-04-10T00:00:00.000Z' as unknown as Date, account: 'OP Bank', merchant: 'Shop', amount: -10, type: 'Expense', category: 'Groceries', paidBy: 'tung', tags: [], note: '', createdAt: new Date(), updatedAt: new Date() }],
      total: 1,
      limit: 10000,
      offset: 0,
      sum: -10,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain('2026-04-10');
  });
});
