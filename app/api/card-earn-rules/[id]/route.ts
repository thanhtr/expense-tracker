import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { parseId, updateCardEarnRuleSchema, parseBody } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const idResult = parseId(idStr);
  if ('error' in idResult) return idResult.error;
  const parsed = parseBody(updateCardEarnRuleSchema, await request.json());
  if ('error' in parsed) return parsed.error;
  try {
    const rule = await prisma.cardEarnRule.update({ where: { id: idResult.id }, data: parsed.data });
    return NextResponse.json(rule);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const idResult = parseId(idStr);
  if ('error' in idResult) return idResult.error;
  try {
    await prisma.cardEarnRule.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    throw e;
  }
}
