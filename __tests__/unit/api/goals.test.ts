import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    savingsGoal: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { GET, POST } from '../../../app/api/goals/route';
import { PATCH, DELETE } from '../../../app/api/goals/[id]/route';
import { prisma } from '../../../lib/db';

const makeGoal = (overrides = {}) => ({
  id: 1,
  name: 'Vacation',
  targetAmount: 3000,
  currentAmount: 500,
  targetDate: new Date('2026-12-31'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeReq = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/goals', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

describe('GET /api/goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns goals list', async () => {
    vi.mocked(prisma.savingsGoal.findMany).mockResolvedValueOnce([makeGoal()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Vacation');
  });
});

describe('POST /api/goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates goal with valid body', async () => {
    vi.mocked(prisma.savingsGoal.create).mockResolvedValueOnce(makeGoal());
    const res = await POST(makeReq('POST', { name: 'Vacation', targetAmount: 3000, targetDate: '2026-12-31' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeReq('POST', { targetAmount: 3000, targetDate: '2026-12-31' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative targetAmount', async () => {
    const res = await POST(makeReq('POST', { name: 'Vacation', targetAmount: -100, targetDate: '2026-12-31' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await POST(makeReq('POST', { name: 'Vacation', targetAmount: 3000, targetDate: '31-12-2026' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 for date that looks valid but is not (month 13)', async () => {
    const res = await POST(makeReq('POST', { name: 'Vacation', targetAmount: 3000, targetDate: '2026-13-01' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates goal with valid partial body', async () => {
    vi.mocked(prisma.savingsGoal.update).mockResolvedValueOnce(makeGoal({ currentAmount: 1000 }));
    const res = await PATCH(makeReq('PATCH', { currentAmount: 1000 }), { params: params('1') });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid id', async () => {
    const res = await PATCH(makeReq('PATCH', { currentAmount: 1000 }), { params: params('abc') });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid targetDate in update', async () => {
    const res = await PATCH(makeReq('PATCH', { targetDate: 'not-a-date' }), { params: params('1') });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes goal with valid id', async () => {
    vi.mocked(prisma.savingsGoal.delete).mockResolvedValueOnce(makeGoal());
    const res = await DELETE(makeReq('DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 for invalid id', async () => {
    const res = await DELETE(makeReq('DELETE'), { params: params('0') });
    expect(res.status).toBe(400);
  });
});
