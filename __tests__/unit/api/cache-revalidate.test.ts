import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '../../../app/api/cache/revalidate/route';
import { revalidateTag } from 'next/cache';

const makeReq = (body?: unknown) =>
  new NextRequest('http://localhost/api/cache/revalidate', {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/cache/revalidate', () => {
  it('defaults to invalidating all three tags when tags is omitted', async () => {
    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.invalidated).toEqual(['data', 'readings', 'config']);
    expect(revalidateTag).toHaveBeenCalledTimes(3);
  });

  it('treats an explicit empty array as a valid no-op, not a malformed request (regression)', async () => {
    const res = await POST(makeReq({ tags: [] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.invalidated).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('invalidates only the requested valid tags', async () => {
    const res = await POST(makeReq({ tags: ['data'] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.invalidated).toEqual(['data']);
    expect(revalidateTag).toHaveBeenCalledWith('data', { expire: 0 });
  });

  it('rejects a non-array tags value', async () => {
    const res = await POST(makeReq({ tags: 'data' }));

    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a non-empty array containing no recognized tag', async () => {
    const res = await POST(makeReq({ tags: ['bogus'] }));

    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
