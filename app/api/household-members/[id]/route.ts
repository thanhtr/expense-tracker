import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await prisma.householdMember.delete({ where: { id: numId } });
  return NextResponse.json({ success: true });
}
