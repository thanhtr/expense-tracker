import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseId } from '@/lib/validation';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const idResult = parseId(idStr);
  if ('error' in idResult) return idResult.error;
  try {
    await prisma.incomeRule.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }
}
