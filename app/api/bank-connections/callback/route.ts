import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { activateSession, getSession } from '@/lib/services/enable-banking';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error || !code) {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    console.error('Enable Banking callback error. Params:', JSON.stringify(params));
    return NextResponse.redirect(new URL(`/settings/bank-connections?error=${error ?? 'no_code'}`, request.nextUrl.origin));
  }

  try {
    // Find the most recent pending connection — session_id was stored at initiate time
    const connection = await prisma.bankConnection.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!connection?.sessionId) {
      return NextResponse.redirect(new URL('/settings/bank-connections?error=no_pending_connection', request.nextUrl.origin));
    }

    await activateSession(connection.sessionId, code);
    const session = await getSession(connection.sessionId);
    const accountId = session.accounts?.[0]?.uid;

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { accountId, status: 'active' },
    });
  } catch (e) {
    console.error('Enable Banking callback error:', e);
    return NextResponse.redirect(new URL('/settings/bank-connections?error=callback_failed', request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL('/settings/bank-connections?connected=1', request.nextUrl.origin));
}
