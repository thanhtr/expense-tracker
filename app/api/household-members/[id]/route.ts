import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { name } = await req.json() as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // Only name is editable — slug is immutable because it's stored as paidBy on transactions
  const member = await prisma.householdMember.update({
    where: { id: numId },
    data: { name: name.trim() },
  });
  return NextResponse.json(member);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await prisma.householdMember.delete({ where: { id: numId } });
  return NextResponse.json({ success: true });
}
