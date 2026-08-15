import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/services/enable-banking';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const aspspId = request.nextUrl.searchParams.get('state');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/settings/bank-connections?error=no_session', request.nextUrl.origin));
  }

  try {
    const session = await getSession(sessionId);
    const accountId = session.accounts?.[0]?.uid;

    await prisma.bankConnection.updateMany({
      where: { aspspId: aspspId ?? undefined, status: 'pending' },
      data: { sessionId, accountId, status: 'active' },
    });
  } catch (e) {
    console.error('Enable Banking callback error:', e);
    return NextResponse.redirect(new URL('/settings/bank-connections?error=callback_failed', request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL('/settings/bank-connections?connected=1', request.nextUrl.origin));
}
