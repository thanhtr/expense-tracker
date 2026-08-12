import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const expected = process.env.AUTH_PASSWORD ?? '';
  const provided = typeof password === 'string' ? password : '';
  const passwordMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!passwordMatch) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
