import { NextRequest, NextResponse } from 'next/server';

/** For a route that accepts either a valid `x-api-token` (CI/pipeline or iOS Shortcut use) or an
 * authenticated session — `proxy.ts` already enforces the session requirement whenever the
 * header is entirely absent (its own `req.headers.has('x-api-token')` bypass), so this only needs
 * to validate the token when one was actually supplied.
 *
 * Checked by presence (`.has`), not truthiness of the value (`.get` alone): proxy.ts's gate skips
 * the session check whenever the header is merely *present*, so a request with the header present
 * but empty must still be rejected here, not treated as "no token supplied". */
export function requireTokenOrSession(request: NextRequest): NextResponse | null {
  if (!request.headers.has('x-api-token')) return null;
  const token = request.headers.get('x-api-token');
  if (token !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
