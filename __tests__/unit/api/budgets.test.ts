import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
    },
  },
}));

import { GET, POST } from '../../../app/api/budgets/route';
import { DELETE } from '../../../app/api/budgets/[id]/route';
import { prisma } from '../../../lib/db';

const makeBudget = (overrides = {}) => ({
  id: 1,
  category: 'Groceries',
  monthlyLimit: 400,
  rollover: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeReq = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/budgets', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

describe('GET /api/budgets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns budget list with rollover fields', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValueOnce([makeBudget()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].category).toBe('Groceries');
    expect(body[0].rolloverAmount).toBe(0);
    expect(body[0].effectiveLimit).toBe(400);
  });

  it('computes rollover underspend for rollover budgets', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValueOnce([makeBudget({ rollover: true })]);
    vi.mocked(prisma.transaction.groupBy).mockResolvedValueOnce([
      { category: 'Groceries', _sum: { amount: -300 } } as never,
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].rolloverAmount).toBe(100); // 400 limit - 300 spent = 100 rollover
    expect(body[0].effectiveLimit).toBe(500);
  });
});

describe('POST /api/budgets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates budget with valid body', async () => {
    vi.mocked(prisma.budget.upsert).mockResolvedValueOnce(makeBudget());
    const res = await POST(makeReq('POST', { category: 'Groceries', monthlyLimit: 400 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.category).toBe('Groceries');
  });

  it('returns 400 for negative monthlyLimit', async () => {
    const res = await POST(makeReq('POST', { category: 'Groceries', monthlyLimit: -50 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid category', async () => {
    const res = await POST(makeReq('POST', { category: 'NotARealCategory', monthlyLimit: 200 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid category');
  });

  it('returns 400 for missing monthlyLimit', async () => {
    const res = await POST(makeReq('POST', { category: 'Groceries' }));
    expect(res.status).toBe(400);
  });

  it('accepts zero monthlyLimit', async () => {
    vi.mocked(prisma.budget.upsert).mockResolvedValueOnce(makeBudget({ monthlyLimit: 0 }));
    const res = await POST(makeReq('POST', { category: 'Groceries', monthlyLimit: 0 }));
    expect(res.status).toBe(200);
  });

  it('passes rollover flag through', async () => {
    vi.mocked(prisma.budget.upsert).mockResolvedValueOnce(makeBudget({ rollover: true }));
    const res = await POST(makeReq('POST', { category: 'Groceries', monthlyLimit: 400, rollover: true }));
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.budget.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ rollover: true }) })
    );
  });
});

describe('DELETE /api/budgets/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes existing budget', async () => {
    vi.mocked(prisma.budget.findUnique).mockResolvedValueOnce(makeBudget());
    vi.mocked(prisma.budget.delete).mockResolvedValueOnce(makeBudget());
    const res = await DELETE(makeReq('DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 for invalid id', async () => {
    const res = await DELETE(makeReq('DELETE'), { params: params('not-a-number') });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent budget', async () => {
    vi.mocked(prisma.budget.findUnique).mockResolvedValueOnce(null);
    const res = await DELETE(makeReq('DELETE'), { params: params('999') });
    expect(res.status).toBe(404);
  });
});
