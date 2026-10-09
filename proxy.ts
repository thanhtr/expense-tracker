import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/session';
import { sessionOptions } from '@/lib/session';
import { isValidApiToken } from '@/lib/api-auth';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login page and auth API routes through
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // API routes that carry their own token auth (e.g. iOS Shortcut, CI upload) — the value is
  // checked here, not just the header's presence, so a wrong/garbage token can't bypass the
  // session check below.
  if (pathname.startsWith('/api/') && req.headers.has('x-api-token')) {
    if (isValidApiToken(req.headers.get('x-api-token'))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.isLoggedIn) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
