import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateAssetSchema, parseBody, parseId } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updateAssetSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, type, balance, recordedAt } = parsed.data;

    const data: Parameters<typeof prisma.asset.update>[0]['data'] = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (balance !== undefined) data.balance = balance;
    if (recordedAt !== undefined) data.recordedAt = new Date(recordedAt);

    const asset = await prisma.asset.update({ where: { id: idResult.id }, data });
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
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    await prisma.asset.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete asset:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
