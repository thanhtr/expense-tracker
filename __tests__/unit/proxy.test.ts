import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('iron-session', () => ({
  getIronSession: vi.fn().mockResolvedValue({ isLoggedIn: false }),
}));

import { getIronSession } from 'iron-session';
import { proxy } from '../../proxy';

const ORIGINAL_API_SECRET = process.env.API_SECRET;

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

describe('proxy', () => {
  beforeEach(() => {
    process.env.API_SECRET = 'correct-secret';
    vi.mocked(getIronSession).mockResolvedValue({ isLoggedIn: false });
  });

  afterEach(() => {
    process.env.API_SECRET = ORIGINAL_API_SECRET;
  });

  it('rejects an x-api-token with the wrong value instead of bypassing auth', async () => {
    const res = await proxy(
      request('/api/transactions/bulk-delete', { 'x-api-token': 'wrong' })
    );
    expect(res.status).toBe(401);
  });

  it('rejects an empty x-api-token header', async () => {
    const res = await proxy(
      request('/api/transactions/bulk-delete', { 'x-api-token': '' })
    );
    expect(res.status).toBe(401);
  });

  it('passes through with the correct x-api-token', async () => {
    const res = await proxy(
      request('/api/transactions/bulk-delete', { 'x-api-token': 'correct-secret' })
    );
    expect(res.status).not.toBe(401);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects to /login when no token and no session', async () => {
    const res = await proxy(request('/api/transactions/bulk-delete'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('always allows /api/auth routes through', async () => {
    const res = await proxy(request('/api/auth/login', { 'x-api-token': 'wrong' }));
    expect(res.status).not.toBe(401);
  });

  it('does not authenticate when API_SECRET is unset', async () => {
    delete process.env.API_SECRET;
    const res = await proxy(
      request('/api/transactions/bulk-delete', { 'x-api-token': 'correct-secret' })
    );
    expect(res.status).toBe(401);
  });
});
