import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
