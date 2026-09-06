import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    transaction: {
      findUnique: vi.fn(),
    },
    transactionLink: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { GET, POST, DELETE } from '../../../app/api/transactions/[id]/links/route';
import { prisma } from '../../../lib/db';

const makeTx = (overrides = {}) => ({
  id: 1,
  date: new Date('2026-08-01'),
  account: 'OP',
  merchant: 'Restaurant X',
  amount: -80,
  note: '',
  type: 'Expense',
  category: 'Dining Out',
  paidBy: 'tung',
  tags: [],
  dedupKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeReq = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/transactions/1/links', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

describe('GET /api/transactions/[id]/links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists linked reimbursements with total', async () => {
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      {
        id: 10,
        expenseTransactionId: 1,
        reimbursementTransactionId: 2,
        createdAt: new Date(),
        reimbursementTransaction: { id: 2, date: new Date('2026-08-02'), merchant: 'Friend Mobilepay', amount: 30 },
      } as never,
    ]);
    const res = await GET(makeReq('GET'), { params: params('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toHaveLength(1);
    expect(body.totalReimbursed).toBe(30);
  });

  it('returns 400 for invalid id', async () => {
    const res = await GET(makeReq('GET'), { params: params('not-a-number') });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions/[id]/links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a link between an expense and a reimbursement', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -80 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    vi.mocked(prisma.transactionLink.create).mockResolvedValueOnce({
      id: 10, expenseTransactionId: 1, reimbursementTransactionId: 2, createdAt: new Date(),
    } as never);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expenseTransactionId).toBe(1);
    expect(body.reimbursementTransactionId).toBe(2);
  });

  it('rejects linking a transaction to itself', async () => {
    const res = await POST(makeReq('POST', { reimbursementTransactionId: 1 }), { params: params('1') });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the expense transaction does not exist', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValueOnce(null);
    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(404);
  });

  it('rejects a candidate that is a regular negative-amount expense', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -80 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Expense', amount: -20 }));
    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(400);
  });

  it('returns 409 when the reimbursement is already linked elsewhere', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -80 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    vi.mocked(prisma.transactionLink.create).mockRejectedValueOnce({ code: 'P2002' });

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already linked/i);
  });
});

describe('DELETE /api/transactions/[id]/links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unlinks an existing reimbursement', async () => {
    vi.mocked(prisma.transactionLink.deleteMany).mockResolvedValueOnce({ count: 1 });
    const res = await DELETE(makeReq('DELETE', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when no matching link exists', async () => {
    vi.mocked(prisma.transactionLink.deleteMany).mockResolvedValueOnce({ count: 0 });
    const res = await DELETE(makeReq('DELETE', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(404);
  });
});
