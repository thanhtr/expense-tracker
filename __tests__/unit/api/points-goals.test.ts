import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => {
  const prismaMock = {
    pointsGoal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pointsBalance: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prismaMock)),
  };
  return { prisma: prismaMock };
});

import { GET, POST } from '../../../app/api/points-goals/route';
import { PATCH, DELETE } from '../../../app/api/points-goals/[id]/route';
import { POST as POST_BALANCE, DELETE as DELETE_BALANCE } from '../../../app/api/points-goals/[id]/balances/route';
import { prisma } from '../../../lib/db';

const makeGoal = (overrides = {}) => ({
  id: 1,
  name: 'Avios 2027',
  unit: 'Avios',
  periodStart: new Date('2027-01-01'),
  periodEnd: new Date('2027-12-31'),
  note: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  levels: [
    { id: 1, goalId: 1, label: 'Minimum', targetPoints: 80_000, sortOrder: 0 },
    { id: 2, goalId: 1, label: 'Extended', targetPoints: 160_000, sortOrder: 1 },
  ],
  balances: [],
  ...overrides,
});

const makeReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

describe('GET /api/points-goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns goals with computed progress', async () => {
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([makeGoal()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].progress).toBeDefined();
    expect(body[0].progress.levels).toHaveLength(2);
  });
});

describe('POST /api/points-goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a goal with levels', async () => {
    vi.mocked(prisma.pointsGoal.create).mockResolvedValueOnce(makeGoal());
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', {
      name: 'Avios 2027',
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      levels: [
        { label: 'Minimum', targetPoints: 80_000 },
        { label: 'Extended', targetPoints: 160_000 },
      ],
    }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', {
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      levels: [{ label: 'Minimum', targetPoints: 80_000 }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when periodEnd is before periodStart', async () => {
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', {
      name: 'Avios 2027',
      periodStart: '2027-12-31',
      periodEnd: '2027-01-01',
      levels: [{ label: 'Minimum', targetPoints: 80_000 }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a goal with no levels', async () => {
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', {
      name: 'Avios 2027',
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      levels: [],
    }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/points-goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates goal fields', async () => {
    vi.mocked(prisma.pointsGoal.update).mockResolvedValueOnce(makeGoal({ name: 'Renamed' }));
    const res = await PATCH(
      makeReq('http://localhost/api/points-goals/1', 'PATCH', { name: 'Renamed' }),
      { params: params('1') },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Renamed');
  });

  it('returns 400 for invalid id', async () => {
    const res = await PATCH(
      makeReq('http://localhost/api/points-goals/abc', 'PATCH', { name: 'x' }),
      { params: params('abc') },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/points-goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a goal', async () => {
    vi.mocked(prisma.pointsGoal.delete).mockResolvedValueOnce(makeGoal());
    const res = await DELETE(makeReq('http://localhost/api/points-goals/1', 'DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/points-goals/[id]/balances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a reading and returns updated progress', async () => {
    vi.mocked(prisma.pointsBalance.create).mockResolvedValueOnce({
      id: 1, goalId: 1, balance: 50_000, recordedAt: new Date('2026-06-01'), note: '', createdAt: new Date(),
    });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      balances: [{ id: 1, balance: 50_000, recordedAt: new Date('2026-06-01'), note: '' }],
    }));
    const res = await POST_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances', 'POST', { balance: 50_000, recordedAt: '2026-06-01' }),
      { params: params('1') },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.progress.latestBalance).toBe(50_000);
  });

  it('returns 400 for a negative balance', async () => {
    const res = await POST_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances', 'POST', { balance: -5, recordedAt: '2026-06-01' }),
      { params: params('1') },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/points-goals/[id]/balances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a reading scoped to its goal', async () => {
    vi.mocked(prisma.pointsBalance.deleteMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal());
    const res = await DELETE_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances?balanceId=2', 'DELETE'),
      { params: params('1') },
    );
    expect(res.status).toBe(200);
    expect(prisma.pointsBalance.deleteMany).toHaveBeenCalledWith({ where: { id: 2, goalId: 1 } });
    const body = await res.json();
    expect(body.id).toBe(1);
  });

  it('returns 404 when the reading does not belong to that goal', async () => {
    vi.mocked(prisma.pointsBalance.deleteMany).mockResolvedValueOnce({ count: 0 });
    const res = await DELETE_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances?balanceId=999', 'DELETE'),
      { params: params('1') },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when balanceId is missing', async () => {
    const res = await DELETE_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances', 'DELETE'),
      { params: params('1') },
    );
    expect(res.status).toBe(400);
  });
});
