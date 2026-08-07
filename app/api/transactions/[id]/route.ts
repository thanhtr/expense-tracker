import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { recordCorrection } from '@/lib/services/learned-rules-service';
import { CATEGORIES } from '@/lib/constants';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json() as { category?: string; tags?: string[] };
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    const updateData: { category?: string; tags?: string[] } = {};

    if (body.category !== undefined) {
      if (!(CATEGORIES as readonly string[]).includes(body.category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      updateData.category = body.category;
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string')) {
        return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 });
      }
      updateData.tags = body.tags;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (updateData.category) {
      await recordCorrection(tx.merchant, updateData.category);
    }
    const updated = await prisma.transaction.update({ where: { id }, data: updateData });

    return NextResponse.json({ id, category: updated.category, tags: updated.tags, success: true });
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
