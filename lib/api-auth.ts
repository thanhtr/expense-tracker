import { NextRequest, NextResponse } from 'next/server';

/** `!token` first: an empty supplied value must never authenticate, even in the misconfigured
 * case where `API_SECRET` itself is also unset/empty (so the two wouldn't otherwise differ). */
export function isValidApiToken(token: string | null): boolean {
  return !!token && !!process.env.API_SECRET && token === process.env.API_SECRET;
}

/** For a route that accepts either a valid `x-api-token` (CI/pipeline or iOS Shortcut use) or an
 * authenticated session. `proxy.ts` already validates the token's value for every `/api/*` route
 * before a request reaches here; this is kept as defense in depth for the two routes that call it. */
export function requireTokenOrSession(request: NextRequest): NextResponse | null {
  if (!request.headers.has('x-api-token')) return null;
  if (!isValidApiToken(request.headers.get('x-api-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
