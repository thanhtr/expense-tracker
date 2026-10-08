import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    finnairPlusTier: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { GET, PATCH } from '../../../app/api/finnair-tier/route';
import { prisma } from '../../../lib/db';

const makeReq = (body: unknown) =>
  new NextRequest('http://localhost/api/finnair-tier', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/finnair-tier', () => {
  it('defaults to basic when no row exists', async () => {
    vi.mocked(prisma.finnairPlusTier.findUnique).mockResolvedValueOnce(null);
    const res = await GET();
    const body = await res.json();
    expect(body.tier).toBe('basic');
  });

  it('returns the saved tier', async () => {
    vi.mocked(prisma.finnairPlusTier.findUnique).mockResolvedValueOnce({ id: 1, tier: 'silver' } as never);
    const res = await GET();
    const body = await res.json();
    expect(body.tier).toBe('silver');
  });
});

describe('PATCH /api/finnair-tier', () => {
  it('upserts the tier', async () => {
    vi.mocked(prisma.finnairPlusTier.upsert).mockResolvedValueOnce({ id: 1, tier: 'silver' } as never);
    const res = await PATCH(makeReq({ tier: 'silver' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('silver');
    expect(prisma.finnairPlusTier.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, tier: 'silver' },
      update: { tier: 'silver' },
    });
  });

  it('returns 400 for an invalid tier', async () => {
    const res = await PATCH(makeReq({ tier: 'gold' }));
    expect(res.status).toBe(400);
  });
});
