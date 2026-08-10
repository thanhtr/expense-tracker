import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    guidelineBucket: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { GET, PUT } from '../../../app/api/guidelines/route';
import { prisma } from '../../../lib/db';

const makeReq = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/guidelines', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const validBuckets = [
  { bucket: 'needs', targetPct: 50, categories: ['Groceries', 'Rent & Housing'] },
  { bucket: 'wants', targetPct: 30, categories: ['Dining Out', 'Entertainment'] },
  { bucket: 'savings', targetPct: 20, categories: ['Investments'] },
];

describe('GET /api/guidelines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns defaults when no DB rows', async () => {
    vi.mocked(prisma.guidelineBucket.findMany).mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buckets).toHaveLength(3);
    expect(body.buckets[0].bucket).toBe('needs');
    expect(body.buckets[0].targetPct).toBe(50);
  });

  it('returns saved buckets when DB has rows', async () => {
    vi.mocked(prisma.guidelineBucket.findMany).mockResolvedValueOnce([
      { id: 1, bucket: 'needs', targetPct: 60, categories: JSON.stringify(['Groceries']) },
      { id: 2, bucket: 'wants', targetPct: 25, categories: JSON.stringify(['Dining Out']) },
      { id: 3, bucket: 'savings', targetPct: 15, categories: JSON.stringify(['Investments']) },
    ] as never);
    const res = await GET();
    const body = await res.json();
    expect(body.buckets[0].targetPct).toBe(60);
  });
});

describe('PUT /api/guidelines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves valid 3-bucket config', async () => {
    vi.mocked(prisma.guidelineBucket.upsert).mockResolvedValue({} as never);
    const res = await PUT(makeReq('PUT', { buckets: validBuckets }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(vi.mocked(prisma.guidelineBucket.upsert)).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when percentages do not sum to 100', async () => {
    const bad = validBuckets.map((b, i) => ({ ...b, targetPct: i === 0 ? 60 : 30 })); // 60+30+30=120
    const res = await PUT(makeReq('PUT', { buckets: bad }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('100');
  });

  it('returns 400 for fewer than 3 buckets', async () => {
    const res = await PUT(makeReq('PUT', { buckets: validBuckets.slice(0, 2) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid bucket name', async () => {
    const bad = [{ bucket: 'misc', targetPct: 50, categories: [] }, ...validBuckets.slice(1)];
    const res = await PUT(makeReq('PUT', { buckets: bad }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for targetPct exceeding 100', async () => {
    const bad = [{ ...validBuckets[0], targetPct: 110 }, ...validBuckets.slice(1)];
    const res = await PUT(makeReq('PUT', { buckets: bad }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing buckets field', async () => {
    const res = await PUT(makeReq('PUT', { data: validBuckets }));
    expect(res.status).toBe(400);
  });
});
