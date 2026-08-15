import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startAuth } from '@/lib/services/enable-banking';

export async function POST(request: NextRequest) {
  const { aspspId, aspspName, accountLabel, owner } = await request.json();

  if (!aspspId || !accountLabel) {
    return NextResponse.json({ error: 'aspspId and accountLabel are required' }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const redirectUrl = `${origin}/api/bank-connections/callback`;

  // Call startAuth with a placeholder state; we'll update it to session_id after
  const { url, session_id } = await startAuth(aspspId, redirectUrl, aspspId);

  const connection = await prisma.bankConnection.create({
    data: { aspspId, aspspName: aspspName ?? aspspId, accountLabel, owner: owner ?? 'tung', sessionId: session_id },
  });

  return NextResponse.json({ authUrl: url, connectionId: connection.id });
}
