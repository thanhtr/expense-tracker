import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, category } = body as { ids: number[]; category: string };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const result = await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { category },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Bulk categorize error:', error);
    return NextResponse.json({ error: 'Failed to bulk categorize' }, { status: 500 });
  }
}
