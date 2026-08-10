import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';
import { updateSplitsSchema, parseBody, parseId } from '@/lib/validation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const splits = await prisma.transactionSplit.findMany({
      where: { transactionId: idResult.id },
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
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updateSplitsSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { splits } = parsed.data;

    for (const s of splits) {
      if (!(CATEGORIES as readonly string[]).includes(s.category)) {
        return NextResponse.json({ error: `Invalid category: ${s.category}` }, { status: 400 });
      }
    }

    const tx = await prisma.transaction.findUnique({ where: { id: idResult.id } });
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const ops = await prisma.$transaction([
      prisma.transactionSplit.deleteMany({ where: { transactionId: idResult.id } }),
      ...splits.map(s => prisma.transactionSplit.create({
        data: { transactionId: idResult.id, category: s.category, amount: s.amount },
      })),
    ]);

    void ops;

    const result = await prisma.transactionSplit.findMany({
      where: { transactionId: idResult.id },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to update splits:', error);
    return NextResponse.json({ error: 'Failed to update splits' }, { status: 500 });
  }
}
