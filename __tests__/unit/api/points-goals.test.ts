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
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    pointsFlight: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
    },
    fireConfig: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock('../../../lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
}));

import { GET, POST } from '../../../app/api/points-goals/route';
import { PATCH, DELETE } from '../../../app/api/points-goals/[id]/route';
import { POST as POST_BALANCE, PATCH as PATCH_BALANCE, DELETE as DELETE_BALANCE } from '../../../app/api/points-goals/[id]/balances/route';
import { POST as POST_FLIGHT } from '../../../app/api/points-goals/[id]/flights/route';
import { PATCH as PATCH_FLIGHT, DELETE as DELETE_FLIGHT } from '../../../app/api/points-goals/[id]/flights/[flightId]/route';
import { prisma } from '../../../lib/db';
import { getDashboardStats } from '../../../lib/services/aggregation-service';

const makeGoal = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Avios 2027',
  unit: 'Avios',
  note: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  balances: [],
  flights: [],
  ...overrides,
});

const makeReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });
const flightParams = (id: string, flightId: string) => Promise.resolve({ id, flightId });

beforeEach(() => {
  vi.clearAllMocks();
  // Most tests don't care about the household-cash enrichment; give it a harmless default.
  vi.mocked(getDashboardStats).mockResolvedValue({ net: 0, totalInvestments: 0, totalIncome: 0, byMonthIncome: [] } as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([]);
  vi.mocked(prisma.fireConfig.findUnique).mockResolvedValue(null);
  // enrichPointsGoal (single-goal mutation responses) looks up sibling Avios goals for a shared
  // cash plan; default to none so tests that don't care about this don't need their own mock.
  vi.mocked(prisma.pointsGoal.findMany).mockResolvedValue([]);
});

describe('GET /api/points-goals', () => {
  it('returns goals with computed progress', async () => {
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([makeGoal()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].progress).toBeDefined();
    expect(body[0].progress.flights).toEqual([]);
  });

  it('attaches strategy and cashPlan for an Avios-unit goal', async () => {
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([makeGoal()]);
    vi.mocked(getDashboardStats).mockResolvedValueOnce({ net: 12_000, totalInvestments: 0, totalIncome: 0, byMonthIncome: [] } as never);
    const res = await GET();
    const body = await res.json();
    expect(body[0].strategy).toBeDefined();
    expect(body[0].cashPlan).toBeDefined();
  });

  it('does not fetch household data for a non-Avios goal', async () => {
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([makeGoal({ unit: 'Miles' })]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].strategy).toBeUndefined();
    expect(getDashboardStats).not.toHaveBeenCalled();
  });
});

describe('POST /api/points-goals', () => {
  it('creates a goal', async () => {
    vi.mocked(prisma.pointsGoal.create).mockResolvedValueOnce(makeGoal());
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', { name: 'Avios 2027' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeReq('http://localhost/api/points-goals', 'POST', {}));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/points-goals/[id]', () => {
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

  it('returns 404 for a non-existent goal', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(prisma.pointsGoal.update).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    const res = await PATCH(
      makeReq('http://localhost/api/points-goals/999', 'PATCH', { name: 'x' }),
      { params: params('999') },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/points-goals/[id]', () => {
  it('deletes a goal', async () => {
    vi.mocked(prisma.pointsGoal.delete).mockResolvedValueOnce(makeGoal());
    const res = await DELETE(makeReq('http://localhost/api/points-goals/1', 'DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/points-goals/[id]/balances', () => {
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

  it('returns 404 when the goal was deleted', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(prisma.pointsBalance.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }),
    );
    const res = await POST_BALANCE(
      makeReq('http://localhost/api/points-goals/999/balances', 'POST', { balance: 1, recordedAt: '2026-06-01' }),
      { params: params('999') },
    );
    expect(res.status).toBe(404);
  });

  it('persists amexMr, defaulting to 0 when omitted', async () => {
    vi.mocked(prisma.pointsBalance.create).mockResolvedValueOnce({
      id: 1, goalId: 1, balance: 50_000, amexMr: 20_000, recordedAt: new Date('2026-06-01'), note: '', createdAt: new Date(),
    });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      balances: [{ id: 1, balance: 50_000, amexMr: 20_000, recordedAt: new Date('2026-06-01'), note: '' }],
    }));
    const res = await POST_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances', 'POST', { balance: 50_000, amexMr: 20_000, recordedAt: '2026-06-01' }),
      { params: params('1') },
    );
    expect(res.status).toBe(201);
    expect(prisma.pointsBalance.create).toHaveBeenCalledWith({
      data: { goalId: 1, balance: 50_000, amexMr: 20_000, note: '', recordedAt: new Date('2026-06-01') },
    });
    const body = await res.json();
    expect(body.progress.amexMrAviosEquivalent).toBe(11_760);
  });
});

describe('PATCH /api/points-goals/[id]/balances', () => {
  it('updates a reading scoped to its goal', async () => {
    vi.mocked(prisma.pointsBalance.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      balances: [{ id: 2, balance: 60_000, recordedAt: new Date('2026-07-01'), note: 'corrected' }],
    }));
    const res = await PATCH_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances?balanceId=2', 'PATCH', { balance: 60_000, note: 'corrected' }),
      { params: params('1') },
    );
    expect(res.status).toBe(200);
    expect(prisma.pointsBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 2, goalId: 1 },
      data: { balance: 60_000, note: 'corrected' },
    });
    const body = await res.json();
    expect(body.progress.latestBalance).toBe(60_000);
  });

  it('returns 404 when the reading does not belong to that goal', async () => {
    vi.mocked(prisma.pointsBalance.updateMany).mockResolvedValueOnce({ count: 0 });
    const res = await PATCH_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances?balanceId=999', 'PATCH', { balance: 1 }),
      { params: params('1') },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when balanceId is missing', async () => {
    const res = await PATCH_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances', 'PATCH', { balance: 1 }),
      { params: params('1') },
    );
    expect(res.status).toBe(400);
  });

  it('updates amexMr when provided', async () => {
    vi.mocked(prisma.pointsBalance.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      balances: [{ id: 2, balance: 60_000, amexMr: 0, recordedAt: new Date('2026-07-01'), note: '' }],
    }));
    const res = await PATCH_BALANCE(
      makeReq('http://localhost/api/points-goals/1/balances?balanceId=2', 'PATCH', { amexMr: 0 }),
      { params: params('1') },
    );
    expect(res.status).toBe(200);
    expect(prisma.pointsBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 2, goalId: 1 },
      data: { amexMr: 0 },
    });
  });
});

describe('DELETE /api/points-goals/[id]/balances', () => {
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

describe('POST /api/points-goals/[id]/flights', () => {
  it('creates a flight and returns updated progress', async () => {
    vi.mocked(prisma.pointsFlight.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      flights: [{
        id: 1, goalId: 1, label: 'Japan outbound', points: 80_000, economyFareEur: 834,
        neededBy: new Date('2027-06-01'), status: 'planned', redeemedAt: null, note: '', createdAt: new Date(),
      }],
    }));
    const res = await POST_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights', 'POST', {
        label: 'Japan outbound', points: 80_000, economyFareEur: 834, neededBy: '2027-06-01',
      }),
      { params: params('1') },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.progress.flights).toHaveLength(1);
  });

  it('returns 400 for a non-positive points value', async () => {
    const res = await POST_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights', 'POST', { label: 'x', points: 0, neededBy: '2027-06-01' }),
      { params: params('1') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the goal was deleted', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(prisma.pointsFlight.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }),
    );
    const res = await POST_FLIGHT(
      makeReq('http://localhost/api/points-goals/999/flights', 'POST', { label: 'x', points: 1, neededBy: '2027-06-01' }),
      { params: params('999') },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/points-goals/[id]/flights/[flightId]', () => {
  it('marks a flight redeemed', async () => {
    vi.mocked(prisma.pointsFlight.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal({
      flights: [{
        id: 1, goalId: 1, label: 'Japan outbound', points: 80_000, economyFareEur: null,
        neededBy: new Date('2027-06-01'), status: 'redeemed', redeemedAt: new Date('2027-01-10'), note: '', createdAt: new Date(),
      }],
    }));
    const res = await PATCH_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights/1', 'PATCH', { status: 'redeemed', redeemedAt: '2027-01-10' }),
      { params: flightParams('1', '1') },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // neededBy (2027-06-01) is still in the future, so it stays in the main list, not pastFlights.
    expect(body.progress.flights).toHaveLength(1);
    expect(body.progress.flights[0].status).toBe('redeemed');
  });

  it('requires redeemedAt when marking a flight redeemed', async () => {
    const res = await PATCH_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights/1', 'PATCH', { status: 'redeemed' }),
      { params: flightParams('1', '1') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the flight does not belong to that goal', async () => {
    vi.mocked(prisma.pointsFlight.updateMany).mockResolvedValueOnce({ count: 0 });
    const res = await PATCH_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights/999', 'PATCH', { label: 'x' }),
      { params: flightParams('1', '999') },
    );
    expect(res.status).toBe(404);
    expect(prisma.pointsFlight.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 999, goalId: 1 } }),
    );
  });
});

describe('DELETE /api/points-goals/[id]/flights/[flightId]', () => {
  it('deletes a flight scoped to its goal', async () => {
    vi.mocked(prisma.pointsFlight.deleteMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.pointsGoal.findUnique).mockResolvedValueOnce(makeGoal());
    const res = await DELETE_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights/2', 'DELETE'),
      { params: flightParams('1', '2') },
    );
    expect(res.status).toBe(200);
    expect(prisma.pointsFlight.deleteMany).toHaveBeenCalledWith({ where: { id: 2, goalId: 1 } });
  });

  it('returns 404 for a cross-goal flight id', async () => {
    vi.mocked(prisma.pointsFlight.deleteMany).mockResolvedValueOnce({ count: 0 });
    const res = await DELETE_FLIGHT(
      makeReq('http://localhost/api/points-goals/1/flights/999', 'DELETE'),
      { params: flightParams('1', '999') },
    );
    expect(res.status).toBe(404);
  });
});

