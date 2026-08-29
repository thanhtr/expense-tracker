import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { recordCorrection } from '@/lib/services/learned-rules-service';
import { getCategoriesCached } from '@/lib/categories-cache';
import { updateTransactionSchema, parseBody, parseId } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updateTransactionSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { category, tags, note } = parsed.data;

    const updateData: { category?: string; tags?: string[]; note?: string } = {};

    if (category !== undefined) {
      const validCategories = await getCategoriesCached();
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      updateData.category = category;
    }

    if (tags !== undefined) {
      updateData.tags = tags;
    }

    if (note !== undefined) {
      updateData.note = note;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({ where: { id: idResult.id } });
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (updateData.category) {
      await recordCorrection(tx.merchant, updateData.category);
    }
    const updated = await prisma.transaction.update({ where: { id: idResult.id }, data: updateData });

    return NextResponse.json({ id: idResult.id, category: updated.category, tags: updated.tags, success: true });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    await prisma.transaction.delete({ where: { id: idResult.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
