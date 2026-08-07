import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const splits = await prisma.transactionSplit.findMany({
      where: { transactionId: id },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(splits);
  } catch (error) {
    console.error('Failed to fetch splits:', error);
    return NextResponse.json({ error: 'Failed to fetch splits' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await request.json() as { splits?: { category: string; amount: number }[] };

    if (!body.splits || !Array.isArray(body.splits)) {
      return NextResponse.json({ error: 'splits array is required' }, { status: 400 });
    }

    for (const s of body.splits) {
      if (!s.category || typeof s.amount !== 'number' || s.amount <= 0) {
        return NextResponse.json({ error: 'Each split must have a valid category and positive amount' }, { status: 400 });
      }
      if (!(CATEGORIES as readonly string[]).includes(s.category)) {
        return NextResponse.json({ error: `Invalid category: ${s.category}` }, { status: 400 });
      }
    }

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const splits = await prisma.$transaction([
      prisma.transactionSplit.deleteMany({ where: { transactionId: id } }),
      ...body.splits.map(s => prisma.transactionSplit.create({
        data: { transactionId: id, category: s.category, amount: s.amount },
      })),
    ]);

    const result = await prisma.transactionSplit.findMany({
      where: { transactionId: id },
      orderBy: { id: 'asc' },
    });

    // silence unused variable
    void splits;

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to update splits:', error);
    return NextResponse.json({ error: 'Failed to update splits' }, { status: 500 });
  }
}
