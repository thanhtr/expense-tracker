import { NextRequest, NextResponse } from 'next/server';

export function requireToken(request: NextRequest): NextResponse | null {
  const token = request.headers.get('x-api-token');
  if (!token || token !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
