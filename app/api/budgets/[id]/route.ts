import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseId } from '@/lib/validation';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const existing = await prisma.budget.findUnique({ where: { id: idResult.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    await prisma.budget.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete budget:', error);
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
  }
}
