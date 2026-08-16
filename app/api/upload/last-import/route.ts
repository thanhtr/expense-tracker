import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const rows = await prisma.transaction.groupBy({
    by: ['account'],
    _max: { date: true },
  });

  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.account] = row._max.date ? row._max.date.toISOString().slice(0, 10) : null;
  }

  return NextResponse.json(result);
}
