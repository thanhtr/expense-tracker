import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { recordCorrection } from '@/lib/services/learned-rules-service';
import { CATEGORIES } from '@/lib/constants';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { category } = await request.json();
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    await recordCorrection(tx.merchant, category);
    await prisma.transaction.update({ where: { id }, data: { category } });

    return NextResponse.json({ id, category, success: true });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    await prisma.transaction.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
