import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    transaction: {
      findUnique: vi.fn(),
    },
    transactionLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/services/aggregation-service', () => ({
  invalidateDashboardCache: vi.fn(),
}));

import { GET, POST, DELETE } from '../../../app/api/transactions/[id]/links/route';
import { prisma } from '../../../lib/db';
import { invalidateDashboardCache } from '../../../lib/services/aggregation-service';

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

  it('lists linked reimbursements', async () => {
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
    expect(body.links[0].reimbursementTransaction.amount).toBe(30);
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
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.transactionLink.create).mockResolvedValueOnce({
      id: 10, expenseTransactionId: 1, reimbursementTransactionId: 2, createdAt: new Date(),
    } as never);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expenseTransactionId).toBe(1);
    expect(body.reimbursementTransactionId).toBe(2);
    expect(invalidateDashboardCache).toHaveBeenCalled();
  });

  it('rejects a reimbursement that would exceed the expense amount', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -50 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 80 }));
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([]);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceed the expense amount/i);
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
  });

  it('rejects when already-linked reimbursements plus the new one would exceed the expense amount', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -50 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([
      { reimbursementTransaction: { amount: 25 } } as never,
    ]);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(400);
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
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

  it('rejects when the "expense" side is an Income transaction', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Income', amount: 100 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(400);
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
  });

  it('rejects when the "expense" side is a positive-amount Expense', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: 30 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(400);
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the reimbursement is already linked elsewhere', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -80 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.transactionLink.create).mockRejectedValueOnce({ code: 'P2002' });
    vi.mocked(prisma.transactionLink.findUnique).mockResolvedValueOnce({
      id: 99, expenseTransactionId: 5, reimbursementTransactionId: 2, createdAt: new Date(),
    } as never);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Already linked to another expense');
  });

  it('returns 409 with a same-expense message when the P2002 conflict is a duplicate of this link', async () => {
    vi.mocked(prisma.transaction.findUnique)
      .mockResolvedValueOnce(makeTx({ id: 1, type: 'Expense', amount: -80 }))
      .mockResolvedValueOnce(makeTx({ id: 2, type: 'Income', amount: 30 }));
    vi.mocked(prisma.transactionLink.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.transactionLink.create).mockRejectedValueOnce({ code: 'P2002' });
    vi.mocked(prisma.transactionLink.findUnique).mockResolvedValueOnce({
      id: 99, expenseTransactionId: 1, reimbursementTransactionId: 2, createdAt: new Date(),
    } as never);

    const res = await POST(makeReq('POST', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Already linked to this expense');
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
    expect(invalidateDashboardCache).toHaveBeenCalled();
  });

  it('returns 404 when no matching link exists', async () => {
    vi.mocked(prisma.transactionLink.deleteMany).mockResolvedValueOnce({ count: 0 });
    const res = await DELETE(makeReq('DELETE', { reimbursementTransactionId: 2 }), { params: params('1') });
    expect(res.status).toBe(404);
  });
});
