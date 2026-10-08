import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/db', () => ({
  prisma: {
    cardEarnRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { GET, POST } from '../../../app/api/card-earn-rules/route';
import { PATCH, DELETE } from '../../../app/api/card-earn-rules/[id]/route';
import { prisma } from '../../../lib/db';

const makeReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/card-earn-rules', () => {
  it('returns rules', async () => {
    vi.mocked(prisma.cardEarnRule.findMany).mockResolvedValueOnce([{ id: 1, account: 'Amex', merchantPattern: 'X', classification: 'bonus', note: '' }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/card-earn-rules', () => {
  it('creates a rule', async () => {
    vi.mocked(prisma.cardEarnRule.create).mockResolvedValueOnce({ id: 1, account: 'Amex', merchantPattern: 'BRITISH AIRWAYS', classification: 'bonus', note: '' } as never);
    const res = await POST(
      makeReq('http://localhost/api/card-earn-rules', 'POST', { account: 'Amex', merchantPattern: 'BRITISH AIRWAYS', classification: 'bonus' }),
    );
    expect(res.status).toBe(201);
  });

  it('returns 400 for an invalid account', async () => {
    const res = await POST(
      makeReq('http://localhost/api/card-earn-rules', 'POST', { account: 'Visa', merchantPattern: 'X', classification: 'bonus' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid classification', async () => {
    const res = await POST(
      makeReq('http://localhost/api/card-earn-rules', 'POST', { account: 'Amex', merchantPattern: 'X', classification: 'double' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing merchantPattern', async () => {
    const res = await POST(
      makeReq('http://localhost/api/card-earn-rules', 'POST', { account: 'Amex', classification: 'bonus' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/card-earn-rules/[id]', () => {
  it('updates classification', async () => {
    vi.mocked(prisma.cardEarnRule.update).mockResolvedValueOnce({ id: 1, account: 'Amex', merchantPattern: 'X', classification: 'excluded', note: '' } as never);
    const res = await PATCH(
      makeReq('http://localhost/api/card-earn-rules/1', 'PATCH', { classification: 'excluded' }),
      { params: params('1') },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classification).toBe('excluded');
  });

  it('returns 404 for a non-existent rule', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(prisma.cardEarnRule.update).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    const res = await PATCH(
      makeReq('http://localhost/api/card-earn-rules/999', 'PATCH', { classification: 'excluded' }),
      { params: params('999') },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/card-earn-rules/[id]', () => {
  it('deletes a rule', async () => {
    vi.mocked(prisma.cardEarnRule.delete).mockResolvedValueOnce({} as never);
    const res = await DELETE(makeReq('http://localhost/api/card-earn-rules/1', 'DELETE'), { params: params('1') });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent rule', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(prisma.cardEarnRule.delete).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    const res = await DELETE(makeReq('http://localhost/api/card-earn-rules/999', 'DELETE'), { params: params('999') });
    expect(res.status).toBe(404);
  });
});
