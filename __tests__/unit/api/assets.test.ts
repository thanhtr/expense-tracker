import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    assetSnapshot: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { GET, POST } from '../../../app/api/assets/route';
import { PATCH, DELETE } from '../../../app/api/assets/[id]/route';
import { prisma } from '../../../lib/db';

const makeAsset = (overrides = {}) => ({
  id: 1,
  name: 'OP Savings',
  type: 'bank',
  balance: 10000,
  recordedAt: new Date('2026-08-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeReq = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/assets', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

describe('GET /api/assets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns assets list', async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValueOnce([makeAsset()]);
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('OP Savings');
  });
});

describe('POST /api/assets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates asset with valid body', async () => {
    vi.mocked(prisma.asset.create).mockResolvedValueOnce(makeAsset());
    const res = await POST(makeReq('POST', { name: 'OP Savings', type: 'bank', balance: 10000, recordedAt: '2026-08-01' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid asset type', async () => {
    const res = await POST(makeReq('POST', { name: 'Gold', type: 'precious-metal', balance: 5000, recordedAt: '2026-08-01' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 for invalid recordedAt format', async () => {
    const res = await POST(makeReq('POST', { name: 'OP Savings', type: 'bank', balance: 10000, recordedAt: '01/08/2026' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for Infinity balance', async () => {
    const res = await POST(makeReq('POST', { name: 'OP Savings', type: 'bank', balance: Infinity, recordedAt: '2026-08-01' }));
    expect(res.status).toBe(400);
  });

  it('accepts negative balance for liability type', async () => {
    vi.mocked(prisma.asset.create).mockResolvedValueOnce(makeAsset({ type: 'liability', balance: -5000 }));
    const res = await POST(makeReq('POST', { name: 'Car Loan', type: 'liability', balance: -5000, recordedAt: '2026-08-01' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await POST(makeReq('POST', { name: 'OP Savings' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/assets/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates balance with valid body', async () => {
    vi.mocked(prisma.asset.update).mockResolvedValueOnce(makeAsset({ balance: 12000 }));
    const res = await PATCH(makeReq('PATCH', { balance: 12000, recordedAt: '2026-08-10' }), { params: params('1') });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid id', async () => {
    const res = await PATCH(makeReq('PATCH', { balance: 12000 }), { params: params('xyz') });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type in update', async () => {
    const res = await PATCH(makeReq('PATCH', { type: 'gold' }), { params: params('1') });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/assets/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes asset with valid id', async () => {
    vi.mocked(prisma.asset.delete).mockResolvedValueOnce(makeAsset());
    const res = await DELETE(makeReq('DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 for invalid id', async () => {
    const res = await DELETE(makeReq('DELETE'), { params: params('-1') });
    expect(res.status).toBe(400);
  });
});
