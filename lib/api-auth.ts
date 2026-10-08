import { NextRequest, NextResponse } from 'next/server';

/** For a route that accepts either a valid `x-api-token` (CI/pipeline or iOS Shortcut use) or an
 * authenticated session. This is the route's *own* check and is what actually validates the
 * token's value — do not rely on `proxy.ts` for that. `proxy.ts` currently only gates on header
 * *presence* (`req.headers.has('x-api-token')`), for every `/api/*` route, not just the ones that
 * call this helper — so a request with the header present but holding any wrong value already
 * skips proxy.ts's session check before it ever reaches here, on every route, whether or not that
 * route calls `requireTokenOrSession`. Flagged as a separate, pre-existing proxy.ts gap (see
 * PROJECT_SUMMARY.md); this helper only closes it for the routes that actually call it. */
export function requireTokenOrSession(request: NextRequest): NextResponse | null {
  if (!request.headers.has('x-api-token')) return null;
  const token = request.headers.get('x-api-token');
  // `!token` first: an empty supplied value must never authenticate, even in the misconfigured
  // case where API_SECRET itself is also unset/empty (so the two wouldn't otherwise differ).
  if (!token || !process.env.API_SECRET || token !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
