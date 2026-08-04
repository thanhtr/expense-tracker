import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, merchant, category } = body as { ids?: number[]; merchant?: string; category: string };

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    let where: Parameters<typeof prisma.transaction.updateMany>[0]['where'];
    if (merchant !== undefined) {
      where = { merchant, type: 'Expense' };
    } else if (Array.isArray(ids) && ids.length > 0) {
      where = { id: { in: ids } };
    } else {
      return NextResponse.json({ error: 'Provide ids or merchant' }, { status: 400 });
    }

    const result = await prisma.transaction.updateMany({ where, data: { category } });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Bulk categorize error:', error);
    return NextResponse.json({ error: 'Failed to bulk categorize' }, { status: 500 });
  }
}
