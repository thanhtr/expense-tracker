import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { bulkDeleteSchema, parseBody } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(bulkDeleteSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { ids } = parsed.data;

    const result = await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json({ error: 'Failed to bulk delete' }, { status: 500 });
  }
}
