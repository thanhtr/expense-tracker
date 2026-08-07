import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_TYPES = ['bank', 'investment', 'property', 'crypto', 'liability'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await request.json() as { name?: string; type?: string; balance?: number; recordedAt?: string };

    const data: { name?: string; type?: string; balance?: number; recordedAt?: Date } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.type !== undefined) {
      if (!(VALID_TYPES as readonly string[]).includes(body.type)) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
      }
      data.type = body.type;
    }
    if (body.balance !== undefined) data.balance = body.balance;
    if (body.recordedAt !== undefined) data.recordedAt = new Date(body.recordedAt);

    const asset = await prisma.asset.update({ where: { id }, data });
    return NextResponse.json(asset);
  } catch (error) {
    console.error('Failed to update asset:', error);
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    await prisma.asset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete asset:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
